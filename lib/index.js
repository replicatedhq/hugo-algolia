var fs = require('fs');
var path = require('path');
var matter = require('gray-matter');
var glob = require('glob');
var removeMarkDown = require('remove-markdown');
var stripTags = require('striptags');
var algoliasearch = require('algoliasearch');
var snake = require('to-snake-case');
var _ = require('lodash');
var cuid = require('cuid');

function HugoAlgolia(input, output, index) {
    const self = this;
    this.list = [];
    this.indices = {};

    // Default creds
    this.algoliaCredentials = {
        indexName: "",
        key: "",
        appID: ""
    };

    // Options
    this.input = 'content/**';
    this.pathToCredentials = './config.yaml';
    this.output = 'public/algolia.json';
    this.byIdOutput = 'public/objList.json';
    this.matterDelims = "---";
    this.localIndexName = "index";
    this.sendData = false;
    this.multInd = false;
    this.writeOtherData = false;
    this.indexById = false;

    this.partial = false; 
    this.customInd = [];

    this.categoryToIndex = "index"; 

    // Set custom input
    if(process.argv.indexOf("-i") !== -1) {
        this.input = (process.argv[process.argv.indexOf("-i") + 1])
    }

    // Set custom output
    if(process.argv.indexOf("-o") !== -1) {
        this.output = process.argv[process.argv.indexOf("-o") + 1];
    }

    // Turn off "other" category
    if(process.argv.indexOf("-wo") !== -1) {
        this.writeOtherData = true;
    }

    // Send to Algolia
    if(process.argv.indexOf("-s") !== -1) {
        this.sendData = true;
    }

    // Send to Algolia
    if(process.argv.indexOf("-id") !== -1) {
        this.indexById = true;
        this.byIdOutput = process.argv[process.argv.indexOf("-id") + 1];
        self.list = {};
    }

    // Set multiple indices to true
    if(process.argv.indexOf("-m") !== -1) {
        let categoryToIndex = process.argv[process.argv.indexOf("-m") + 1];

        if(categoryToIndex !== undefined && !categoryToIndex.includes('-')) {
            this.categoryToIndex = categoryToIndex;
        }

        this.multInd = true;
    }

    if(process.argv.indexOf("-p") !== -1) {
        let customInd = process.argv[process.argv.indexOf("-p") + 1];
        const error = "No categories specified."

        // We have some args
        if(customInd !== undefined)  {
            // Split into array, remove duplicates and falsey values
            customInd = customInd.split(',').map(ind => ind.trim());
            customInd = _.uniq(customInd);
            customInd = _.compact(customInd);

            // Empty quotes
            if(customInd.length === 0 ) throw error;

        // No args
        }  else {
            throw error;
        }

        this.partial = true;
        this.customInd = customInd;
    }

    function copySettings(fromIndex, toIndex) {
        const settings = fromIndex.getSettings();

        if(settings['replicas'] !== undefined) {
            settings['replicas'] = undefined;
        }

        toIndex.setSettings(settings);
    }

    // TODO: fix this
    // function copySynonyms(fromIndex, toIndex) {
    //     let page = 0;

    //     do {
    //         let results = fromIndex.searchSynonyms({
    //             query: '',
    //             type: 'synonym,oneWaySynonym',
    //             page
    //         });

    //         let synonyms = [];
    //         for(syn of results['hits']) {
    //             syn['_highlightResult'] = undefined;
    //             synonyms.push(syn);
    //         }

    //         if(synonyms.length === 0) {
    //             break;
    //         }

    //         toIndex.batchSynonyms(synonyms);

    //         page++;

    //     } while (true);
    // }

    HugoAlgolia.prototype.setCredentials = function () {
        const configMeta = matter.read(self.pathToCredentials);
        const creds = configMeta.data.algolia;

        if(creds) {
            self.algoliaCredentials = {
                indexName: creds.index,
                key: creds.key,
                appID: creds.appID
            }
            self.localIndexName = creds.index;
        }
        
    }

    HugoAlgolia.prototype.index = function() {
        if(input) {
            self.input = input
        } 
        if(output) {
            self.output = output;
        }

        self.setCredentials();
        self.stream = fs.createWriteStream(self.output);
        self.readDirectory(self.input);

        if(self.multInd) {
            if(self.indexById) {
                // Create two outputs, related to each other
                self.listStream = fs.createWriteStream(self.byIdOutput);
                self.listStream.write(JSON.stringify(self.list, null, 4) );
                self.listStream.end();
                console.log(`JSON list of all objects was created in ${self.byIdOutput}`);
            }

            // Create file with multiple indices
            self.handleMultInd(self.list);
            self.stream.write(JSON.stringify(self.indices, null, 4) );
        } else {
            self.stream.write(JSON.stringify(self.list, null, 4) );
        }

        self.stream.end();
        console.log(`JSON index file was created in ${self.output}`);

        // Send data to algolia only if -s flag = true
        if(self.sendData && self.multInd) {
            for (index in self.indices) {
                //             Obj,                 Name
                self.sendIndex(self.indices[index], index);
            }
        } else if (self.sendData) {
            self.sendIndex();
        }
    }

    HugoAlgolia.prototype.convertToMap = function(list) {
        const listMap = new Map();
        Object.keys(list).forEach(key => {
            listMap.set(key, list[key]);
        });

        return Array.from(listMap);
    }

    HugoAlgolia.prototype.handleMultInd = function(list) {
        // Set a place for "other" data to go if no index specified
        var other = snake(self.localIndexName + " other");
        var indices = self.writeOtherData ? { [other]: [] } : {};
        var listToIndex = self.indexById ? self.convertToMap(list) : list;

        for (item of listToIndex) {
            const obj = self.indexById ? item[1] : item;
            const objCuid = self.indexById ? item[0] : "";

            const hasIndex = obj.hasOwnProperty(self.categoryToIndex);
            const indexProp = obj[self.categoryToIndex];

            // Does this item have the index category?
            if(hasIndex) {
                // Is the prop an array of categories?
                if(_.isArray(indexProp)) {
                    for (item of indexProp) {
                        let indexName = snake(self.localIndexName + " " + item);
                        pushToIndex(indexName, obj, objCuid);
                    }
                } else {
                    let indexName = snake(self.localIndexName + " " + indexProp);
                    pushToIndex(indexName, obj, objCuid);
                }
            } else if(self.writeOtherData) {
                pushToIndex(other, obj, objCuid);
            }
        }

        self.indices = indices;

        // Push item to index
        function pushToIndex(name, obj, objCuid) {
            let isIndexInIndices = indices.hasOwnProperty(name);
            let itemToStore = item;

            if(self.indexById) itemToStore = objCuid;

            if(!isIndexInIndices) {
                 // Check for accidental empty index
                const noSpace = name.replace(/\s/g, "");
                if(noSpace !== "") {
                    // Create index in indices and push item into it
                    indices[name] = [];
                    indices[name].push(itemToStore);
                } else {
                    // Push to "other" index
                    indices[other].push(itemToStore);
                }
            // Does this index already exist?
            } else {
                indices[name].push(itemToStore);         
            } 
        }
        
    }
    
    HugoAlgolia.prototype.sendIndex = function(indObj, name) {
        // Send data to Algolia
        const { key, appID } = self.algoliaCredentials;
        const indexName = name ? name : self.algoliaCredentials.indexName;
        const client = algoliasearch(appID, key);
        const index = client.initIndex(indexName);
        const tmpIndex = client.initIndex(`${indexName}-temp`);
        const indexToSend = indObj ? indObj : self.list;

        //Copy settings
        copySettings(index, tmpIndex);

        // Copy synonyms
        //copySynonyms(index, tmpIndex); --> Does not work yet

        tmpIndex.addObjects(indexToSend, (err, content) => {
            if(err) {
                console.log(err);
                return;
            }

            client.moveIndex(tmpIndex.indexName, index.indexName, (err, content) => {
                if(err) {
                    console.log(err);
                } else {
                    console.log(content);
                }
            });
        });
    }
    
    HugoAlgolia.prototype.readDirectory = function(path) {
        const files = glob.sync(path);

        for(let i = 0; i < files.length; i++) {
            let stats = fs.lstatSync(files[i]);

            // Remove folders, only gather actual files
            if(!stats.isDirectory()) {
                // If this is not a directory/folder, read the file
                self.readFile(files[i]);
            }
        }
    }

    HugoAlgolia.prototype.readFile = function(filePath) {
        const ext = path.extname(filePath);
        const meta = matter.read(filePath);

        meta.content = removeMarkDown(meta.content);
		meta.content = stripTags(meta.content);
        
        var uri = '/' + filePath.substring(filePath.lastIndexOf('./'));

        // Define algolia object
        var item = {};
        
        if(meta.data) {
            for (prop in meta.data) {
                item[prop] = meta.data[prop];

                //Prevent duplicate uri props
                if(meta.data.uri) {
                    item.uri = meta.data.uri;
                } else {
                    item.uri = uri

                    //Remove content folder and extension from uri
                    item.uri = item.uri
                        .split('/').splice(2).join("/")
                        .replace(/\.[^/.]+$/, "");
                }

                item.content = meta.content;

                // If this is a partial index, remove everything but the props we want
                if(self.partial) {
                    item = _.pick(item, self.customInd);
                }

            }
        }

        if(self.indexById) {
            if (!_.isEmpty(item)) {
                const id = cuid();
                self.list[id] = item;
            }
        } else {
            if (!_.isEmpty(item)) self.list.push(item);
        }
    }

}

module.exports = HugoAlgolia;