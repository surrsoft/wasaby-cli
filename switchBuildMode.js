const setContents = require('./setContents');
const pathResources = process.argv[2].replace('--resourcesRoot=', '');
const value = process.argv[3].replace('--value=', '');

setContents(pathResources, value).then();
