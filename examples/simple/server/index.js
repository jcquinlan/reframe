const Koa = require('koa');
const routes = require('./routes');

const {symbolSuccess, colorEmphasis} = require('@brillout/cli-theme');

module.exports = startServer();

async function startServer() {
	let port = 3000
	const server = new Koa();

//configure custom middleware
//server.use(middleware())

//configure custom routes
	server.use(routes());

	server.listen(port);

    console.log([
        symbolSuccess,
        'Server running ',
        '(for '+colorEmphasis(process.env.NODE_ENV||'development')+')',
    ].join(''));

    return server;
}