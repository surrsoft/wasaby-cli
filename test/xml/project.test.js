const chai = require('chai');
const sinon = require('sinon');
const xml = require('../../app/xml/xml');
const Project = require('../../app/xml/project');

let project;
let stubxml;
describe('Project', () => {
   beforeEach(() => {
      stubxml = sinon.stub(xml, 'readXmlFile').callsFake(() => ({
         cloud: {
            $: {name: 'project'},
            items: [{service: [{$:{url:'./srv1.s3srv'}},{$:{url:'./srv2.s3srv'}}]}]
         }
      }));
      project = new Project({
         file: '/path/to/project.s3cld'
      });
   });

   afterEach(() => {
      stubxml.restore();
   });

   describe('.getName()', () => {
      it('should return project name', async() => {
         const name = await project.getName();
         chai.expect(name).to.equal('project');
      });
   });
   describe('.getServices()', () => {
      it('should return project services', async() => {
         const srv = await project.getServices();
         chai.expect(srv).to.deep.equal(['/path/to/srv1.s3srv', '/path/to/srv2.s3srv']);
      });
   });
   describe('.getDeploy()', () => {
      it('should return project deploy', async() => {
         const srv = await project.getDeploy();
         chai.expect(srv).to.equal('/path/to/project.s3deploy');
      });
   });
});