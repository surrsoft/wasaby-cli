const fs = require('fs-extra');
const xml2js = require('xml2js');
const logger = require('./logger');
/**
 * Читает xml файл
 * @param {String} filePath Путь до файла
 * @returns {Promise<*>}
 */
function readXmlFile(filePath) {
   return new Promise((resolve, reject) => {
      const parser = new xml2js.Parser();
      let xmlString = fs.readFileSync(filePath, 'utf8');
      parser.parseString(xmlString, (error, result) => {
         if (error === null) {
            resolve(result);
         } else {
            logger.log(error, 'readXmlFile');
            reject(error);
         }
      });
   });
}

/**
 * Записывает объект в xml файл
 * @param {string} filePath - Путь до файла
 * @param {Object} obj - Объект который надо записать
 * @private
 */
function writeXmlFile(filePath, obj) {
   let builder = new xml2js.Builder();
   let xml = builder.buildObject(obj);
   fs.outputFileSync(filePath, xml);
}

module.exports = {
   readXmlFile: readXmlFile,
   writeXmlFile: writeXmlFile
};
