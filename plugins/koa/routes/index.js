'use strict';
const assert_internal = require('reassert/internal');
const compose = require('koa-compose');
const Router = require('koa-router');
const path = require('path');
const fs = require('fs');
const router = new Router();

const getPageHtml = require('@brillout/repage/getPageHtml');
const getProjectConfig = require('@reframe/utils/getProjectConfig');

module.exports = function routes() {
	return compose(
	[
		router.routes(),
		router.allowedMethods()
	]
	)
}

router.get('*', async(ctx, next) => {

	const pathname = ctx.request.url;

	const filename = (
	pathname==='/' && '/index.html' ||
	pathname.split('/').slice(-1)[0].split('.').length===1 && pathname+'.html' ||
	pathname
	);

	const filePath = path.join(getStaticAssetsDir(), filename);
	if(fileExists(filePath) ) {
		ctx.body = require('fs').createReadStream(filePath);
		return
	}
	const html = await getHtml(pathname);
	if( html !== null ) {
		ctx.body = html
		return
	}

	ctx.body = {status:400}
})

/* TODO factor out function (Copied function from hapi plugins, factoring out will break ejection feature.) */
function fileExists(filePath) {
	try {
		return fs.statSync(filePath).isFile();
	}
	catch(e) {
		return false;
	}
}

/* TODO factor out functions (Copied function from hapi plugins, factoring out will break ejection feature.) */
function getStaticAssetsDir() {
	const projectConfig = getProjectConfig();
	const {staticAssetsDir} = require(projectConfig.build.getBuildInfo)();
	return staticAssetsDir;
}

/* TODO factor out functions (Copied function from hapi plugins, factoring out will break ejection feature.) */
async function getHtml(uri) {

	assert_internal(uri && uri.constructor===String, uri);

	const projectConfig = getProjectConfig();

	const {pageConfigs} = require(projectConfig.build.getBuildInfo)();

	const {renderToHtml, router} = projectConfig;

	const html = await getPageHtml({pageConfigs, uri, renderToHtml, router});
	return html;
}


