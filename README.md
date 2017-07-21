# hugo-algolia
## Generate and send indices from Hugo static sites for use with Algolia
An alternative to the [Docserach](https://community.algolia.com/docsearch/) plugin, allowing for manual index exports

### Installation

Install `hugo-algolia` from [npm](https://npmjs.org)

```
npm install hugo-algolia
```

Or

```
yarn add hugo-algolia
```

### Options
`hugo-algolia` looks into the `/content` folder of your site by default and places a JSON file with the export into the `/public` folder, but if you'd like to use custom inputs and outputs just pass an `-i` or `-o` followed by your path via command line.

#### Example
In your package.json file:

```
//Default
scripts: {
    "index": "hugo-algolia"
}
```

or

```
scripts: {
    "index": "hugo-algolia -i \"content/subdir/**\" -o public/my-index.json"
}
```

### Sending to Algolia
You can send your index to Algolia by including your API key, app ID, and index name in your config.yaml--then pass an `-s` flag to your `hugo-algolia` command.

```
---
baseURL: "/"
languageCode: "en-us"
title: "Your site name"
theme: "your-theme"
description: "A cool site!"

algolia:
  index: "index-name"
  key: "[your API key]"
  appID: "[your app id]"
---
```

then 

```
scripts: {
    "index-and-send": "hugo-algolia -s"
}
```

# License
This project is based on the lunr plugin from https://github.com/dgrigg/hugo-lunr, but adapted for use with the Algolia search engine. It is under the ISC License.