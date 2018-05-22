'use strict';

const compose = require('koa-compose');
const Router = require('koa-router');
const path = require('path');

const getProjectConfig = require('@reframe/utils/getProjectConfig');

const router = new Router();
router.get('/', async(ctx, next) => {

	ctx.type = 'html'

	const filePath = path.join(getStaticAssetsDir(), 'index.html');

	ctx.body = require('fs').createReadStream(filePath);
})

//router.use('/api', RouterMain.routes(), RouterMain.allowedMethods());

router.get('*', async(ctx, next) => {
	ctx.body = {status: 404}
})

function getStaticAssetsDir() {
	const projectConfig = getProjectConfig();
	const {staticAssetsDir} = require(projectConfig.build.getBuildInfo)();
	return staticAssetsDir;
}

module.exports = function routes() {
	return compose(
	[
		router.routes(),
		router.allowedMethods()
	]
	)
}
