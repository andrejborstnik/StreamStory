var fs = require('fs');
var bunyan = require('bunyan');
var logformat = require('bunyan-format');
var utils = require('./src/utils.js');

// read the configuration file
var confFile = process.argv[2];

console.log('Reading configuration file: ' + confFile);
var configStr = fs.readFileSync(confFile);
var config = JSON.parse(configStr);

//================================================================
// LOG
//================================================================

var loggerConfig = config.log.logger;
var stream;
if (loggerConfig.stream.type == 'stdout') {
	console.log('Using stdout as log stream ...');
	stream = process.stdout;
} else {	// TODO file stream doesn't work
	console.log('Using file \'' + loggerConfig.stream.file + '\' as log stream ...');
	stream = fs.createWriteStream(loggerConfig.stream.file);
}
var logStream = {
	outputMode: loggerConfig.outputMode,
	out: stream
};

global.log = bunyan.createLogger({
	name: 'NRG4CAST',
	stream: logformat(logStream),
	level: config.log.logger.level
});

//================================================================
// USE-CASE CONFIGURATION
//================================================================
exports.USE_CASE_HELLA = 0;
exports.USE_CASE_NRG = 1;
exports.USE_CASE_MHWIRTH = 2;
exports.USE_CASE = config.useCase == 'hella' ? exports.USE_CASE_HELLA : exports.USE_CASE_NRG;
exports.USE_CASE_NAME = config.useCase;	// TODO remove one of the use case names

if (exports.USE_CASE == exports.USE_CASE_NRG) {
//	exports.STREAM_STORY_RESAMPLING_INTERVAL = 1000*60;	// 1 min
	exports.STREAM_STORY_RESAMPLING_INTERVAL = 1000*20;	// 20s
//	exports.STREAM_STORY_RESAMPLING_INTERVAL = 1000;	// 1s
} else {
	exports.STREAM_STORY_RESAMPLING_INTERVAL = 1000*10;
}

//================================================================
// INITIALIZATION
//================================================================
exports.INITIALIZE_ZERO = config.qminer.initializeZeros;
exports.INTERPOLATION = config.interpolation;

//================================================================
// SERVER
//================================================================
exports.SERVER_PORT = config.server.port;
exports.PING_INTERVAL = config.server.pingInterval;

//================================================================
// QMINER
//================================================================
global.QM_MODULE_PATH = config.qminer.path;
exports.QM_CREATE_PIPELINE = config.qminer.createPipeline;
exports.QM_DATABASE_MODE = config.qminer.mode;

//================================================================
// STORAGE STRUCTURE
//================================================================
var dataPath = config.dataPath + (config.dataPath[config.dataPath.length - 1] == '/' ? '' : '/');
exports.REAL_TIME_BASE_PATH = dataPath + 'online-db/';
exports.REAL_TIME_MODELS_PATH = dataPath + 'models/';
exports.USER_BASES_PATH = dataPath + 'offline-db/';

//================================================================
// QMINER - multiple users
//================================================================
exports.QM_USER_DEFAULT_STORE_NAME = 'default';

//================================================================
// MYSQL
//================================================================
exports.database = config.database;

//================================================================
// STREAM STORY
//================================================================
exports.STREAM_STORY_PARAMS = {
	transitions: {
		type: 'continuous'
	},
	rndseed: 1,
	pastStates: 2,
	verbose: true
}

//================================================================
// INTEGRATION
//================================================================
exports.USE_BROKER = config.integration.type == 'broker';
exports.integration = config.integration;

//================================================================
// PIPELINE
//================================================================
exports.GC_INTERVAL = 1000000

//================================================================
// MULTITHREADING
//================================================================
exports.MULTI_THREAD = true;

//================================================================
// PRINT
//================================================================
exports.RAW_PRINT_INTERVAL = config.log.print.rawData;
exports.STREAM_STORY_PRINT_INTERVAL = config.log.print.streamStory;
exports.STORE_PRINT_INTERVAL = config.log.print.stores;
exports.BROKER_PRINT_INTERVAL = config.log.print.broker;
exports.COEFF_PRINT_INTERVAL = config.log.print.coeff;

// set the global qm object
global.qm = require(QM_MODULE_PATH);
// configure qminer log level
var verbosity = 0;
if (config.log.logger.level == 'debug') verbosity = 1;
else if (config.log.logger.level == 'trace') verbosity = 2;
global.qm.verbosity(verbosity);

//create the directories if they don't exist
try {
	utils.createDirSync(exports.REAL_TIME_BASE_PATH);
	utils.createDirSync(exports.REAL_TIME_MODELS_PATH);
	utils.createDirSync(exports.USER_BASES_PATH);
} catch (e) {
	log.error(e, 'Failed to create directories!');
	process.exit(3);
}

log.info('Configured!');
log.info('================================================');
log.info('Working directory: %s', process.cwd());
log.info('Module path: %s', QM_MODULE_PATH);
log.info('Mode: ' + config.qminer.mode);
log.info('QMiner verbosity: %d', verbosity);
log.info('NRG4CAST params: %s', JSON.stringify(exports.STREAM_STORY_PARAMS));
log.info('Data path: %s', dataPath);
log.info('Use-case: %s', config.useCase);
if (exports.USE_BROKER)
	log.info('Broker URL: %s', config.integration.brokerUrl);
log.info('================================================');
