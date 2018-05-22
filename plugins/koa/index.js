
module.exports = serverPlugin;

function serverPlugin() {
	const packageName = require('./package.json').name;

	const serverEntryFile = require.resolve('./startServer');

	return {
		name: packageName,
		serverEntryFile,
	};
}
