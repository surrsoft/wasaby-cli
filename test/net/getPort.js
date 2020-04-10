const chai = require('chai');
const getPort = require('../../app/net/getPort');

describe('getPort', () => {
   it('should return avaliable port', async() => {
      chai.expect(await getPort()).to.be.within(1023,65536);
   });

   it('should return avaliable port', async() => {
      chai.expect(await getPort()).to.be.above(1023).and.to.be.below(65536);
   });
});
