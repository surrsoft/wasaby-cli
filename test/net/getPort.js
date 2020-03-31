const chai = require('chai');
const getPort = require('../../app/net/getPort');

describe('getPort', () => {
   it('should return avaliable port', async() => {
      chai.expect(await getPort()).to.be.within(1024,65536);
   });

   it('should return avaliable port', async() => {
      chai.expect(await getPort()).to.be.above(1024).and.to.be.below(65536);
   });
});
