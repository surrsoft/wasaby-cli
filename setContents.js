const path = require('path');
const fs = require('fs-extra');

module.exports = async function(pathResources, value) {
   console.log(`Замена buildMode в contents на ${value} путь "${path.join(pathResources, 'contents.js')}"`, 'replace_contents');
   let contents = await fs.readJson(path.join(pathResources, 'contents.json'), "utf8");
   contents.buildMode = value;
   await fs.outputFile(`${path.join(pathResources, 'contents.js')}`, `contents=${JSON.stringify(contents)};`);
   await fs.outputFile(`${path.join(pathResources, 'contents.json')}`, JSON.stringify(contents));
};
