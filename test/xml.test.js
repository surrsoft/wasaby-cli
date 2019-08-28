describe('._writeXmlFile()', () => {
   let stuBuilder, stubFsWrite;
   beforeEach(() => {
      stuBuilder = sinon.stub(xml2js, 'Builder').callsFake(function() {
         this.buildObject = function () {
            return '<testsuite><testcase name="test1"></testcase></testsuite>';
         }
      });
   });
   it('should write xml file', (done) => {
      stubFsWrite = sinon.stub(fs, 'outputFileSync').callsFake(function(name, text) {
         chai.expect(text).to.equal('<testsuite><testcase name="test1"></testcase></testsuite>');
         done();
      });
      cli._writeXmlFile('test', {});
   });

   afterEach(() => {
      stuBuilder.restore();
      stubFsWrite.restore();
   })
});
