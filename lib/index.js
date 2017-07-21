var fs = require('fs');
var path = require('path');
var matter = require('gray-matter');
var glob = require('glob');
var removeMarkDown = require('remove-markdown');
var stripTags = require('striptags');

function HugoAlgoliaIndex(input, output) {
    const self = this;
    this.list = [];

    //defaults
    this.input = 'content/**';
    this.output = 'public/algolia.json';
    this.lang = 'toml';
    this.matterDelims = "+++";

    //this.inputFlag = process.argv[]

    if(process.argv.indexOf("-i") != -1) {
        //this.setInput(process.argv[])
    }

    // HugoAlgoliaIndex.prototype.setInput = function(input) {
    //     self.input = input;
    // }

    // HugoAlgoliaIndex.prototype.setOutput = function(output) {
    //     self.output = output;
    // }

    HugoAlgoliaIndex.prototype.index = function() {
        if(input) {
            self.input = input
        } 
        if(output) {
            self.output = output;
        }

        self.stream = fs.createWriteStream(self.output);
        self.readDirectory(self.input);
    }

    HugoAlgoliaIndex.prototype.readDirectory = function(path) {
        const files = glob.sync(path);
        let plaintext = ""

        for(let i = 0; i < files.length; i++) {
            let stats = fs.lstatSync(files[i]);

            // Remove folders, only gather actual files
            if(!stats.isDirectory()) {
                // If this is not a directory/folder, read the file
                self.readFile(files[i]);
            }
        }
    }

    HugoAlgoliaIndex.prototype.readFile = function(filePath) {
        const ext = path.extname(filePath);
        const meta = matter.read(filePath);

        if (ext == '.md'){
		    meta.content = removeMarkDown(meta.content);
	    } else {
		    meta.content = stripTags(meta.content);
	    }

        var tags = [];
        var uri = '/' + filePath.substring(filePath.lastIndexOf('./'));

        if (meta.data.url != undefined){
		    uri = meta.data.url
	    }

        if (meta.data.tags != undefined){
		    tags = meta.data.tags;
	    }

        var item = {'uri' : uri , 'title' : meta.data.title, 'content': meta.content, 'tags': tags};
        console.log(item);
    }

}

module.exports = HugoAlgoliaIndex;