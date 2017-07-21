var fs = require('fs');
var path = require('path');
var matter = require('gray-matter');
var glob = require('glob');
var removeMarkDown = require('remove-markdown');
var stripTags = require('striptags');
var algoliasearch = require('algoliasearch');

function HugoAlgolia(input, output, index) {
    const self = this;
    this.list = [];

    //defaults
    this.algoliaCredentials = {
        indexName: "",
        key: "",
        appID: "",
    };
    this.input = 'content/**';
    this.pathToCredentials = './config.yaml';
    this.output = 'public/algolia.json';
    this.matterDelims = "---";
    this.sendData = false;

    if(process.argv.indexOf("-i") != -1) {
        this.setInput(process.argv[process.argv.indexOf("-i") + 1])
    }

    if(process.argv.indexOf("-o") != -1) {
        this.setOutput(process.argv[process.argv.indexOf("-o") + 1])
    }

    if(process.argv.indexOf("-s") != -1) {
        this.sendData = true;
    }

    function copySettings(fromIndex, toIndex) {
        const settings = fromIndex.getSettings();

        if(settings['replicas'] !== undefined) {
            settings['replicas'] = undefined;
        }

        toIndex.setSettings(settings);
    }

    // TODO: fix this
    function copySynonyms(fromIndex, toIndex) {
        let page = 0;

        do {
            let results = fromIndex.searchSynonyms({
                query: '',
                type: 'synonym,oneWaySynonym',
                page,
            });

            let synonyms = [];
            for(syn of results['hits']) {
                syn['_highlightResult'] = undefined;
                synonyms.push(syn);
            }

            if(synonyms.length === 0) {
                break;
            }

            toIndex.batchSynonyms(synonyms);

            page++;

        } while (true);
    }

    HugoAlgolia.prototype.setInput = function () {
        self.input = input;
    }

    HugoAlgolia.prototype.setOutput = function () {
        self.output = output; 
    }

    HugoAlgolia.prototype.setCredentials = function () {
        const configMeta = matter.read(self.pathToCredentials);
        const creds = configMeta.data.algolia;

        if(creds.index && creds.key && creds.appID) {
            self.algoliaCredentials = {
                indexName: creds.index,
                key: creds.key,
                appID: creds.appID
            }
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
        self.stream.write(JSON.stringify(self.list, null, 4) );
        self.stream.end();
        console.log("JSON index file has been placed in public/ folder.")

        // Send data to algolia only if -s flag = true
        if(self.sendData) {
            self.sendIndex();
        }
    }
    
    HugoAlgolia.prototype.sendIndex = function() {
        // Send data to Algolia
        const { indexName, key, appID } = self.algoliaCredentials;
        const client = algoliasearch(appID, key);
        const index = client.initIndex(indexName);
        const tmpIndex = client.initIndex(`${indexName}-temp`);

        // Copy settings
        copySettings(index, tmpIndex);

        // Copy synonyms
        //copySynonyms(index, tmpIndex); --> Does not work yet

        tmpIndex.addObjects(self.list, (err, content) => {
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
        for (prop in meta.data) {
            item[prop] = meta.data[prop];

            //Prevent duplicate uri props
            if(meta.data[uri]) {
                item[uri] = meta.data[uri]
            } else {
                item.uri = uri
            }

            item.content = meta.content;
        }

        self.list.push(item);
    }

}

module.exports = HugoAlgolia;