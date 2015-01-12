var qm = require(global.qmModulePath + 'qm.node');
var analytics = require(global.qmModulePath + 'analytics.node');

function createFeatureSpace(store) {
	try {
		console.log('Creating feature space ...');
		console.log('================================================');
		
		var fieldConfigV = [];
		store.fields.forEach(function (field) {
			console.log('Field:\t\'' + field.name + '\',\ttype: \'' + field.type + '\'');
			
			if (field.type == 'float') {
				fieldConfigV.push({
					type: 'numeric',
					source: {store: store.name},
					field: field.name,
					normalize: true
				});
			}
		});
		
		console.log('================================================');
		
		var ftrSpace = new qm.FeatureSpace(base, fieldConfigV);
		
		return ftrSpace;
	} catch (e) {
		console.log('Failed to create feature space: ' + e);
		throw e;
	}
}

var HMC = function (mc, ftrSpace) {
	return {
		init: function (recSet) {
			console.log('Updating feature space ...');
			ftrSpace.updateRecords(recSet);
			
			var colMat = ftrSpace.ftrColMat(recSet);
			var timeV = recSet.getVec('time');
			
			console.log('Creating model ...');
			mc.init(colMat, timeV);
			console.log('Done!');
		},
		
		update: function (rec) {
			var ftrVec = ftrSpace.ftrVec(rec);
			var recTm = rec.time;
			
			mc.learn(ftrVec, recTm);
		},
		
		save: function (mcFName, ftrFname) {
			console.log('Saving Markov chain ...');
			mc.save(mcFName);
			console.log('Saving feature space ...');
			ftrSpace.save(ftrFname);
			console.log('Done!');
		},
		
		getModel: function () {
			return mc;
		},
		
		getFtrSpace: function () {
			return ftrSpace;
		},
		
		currStates: function () {
			return mc.currStates();
		},
		
		futureStates: function (level, state, time) {
			return mc.futureStates(level, state, time);
		},
		
		stateDetails: function (state, level) {
			var coords = mc.fullCoords(state);
			var invCoords = ftrSpace.invFtrVec(coords);
			var futureStates = mc.futureStates(level, state);
			
			var features = [];
			for (var i = 0; i < invCoords.length; i++) {
				features.push({name: ftrSpace.getFtr(i), value: invCoords.at(i)});
			}
			
			return {
				features: features,
				futureStates: futureStates
			};
		},
		
		onStateChanged: function (callback) {
			mc.onStateChanged(callback);
		}
	};
};

exports.create = function (recSet, ctmcParams) {
	console.log('Creating hierarchical Markov chain ...');
	
	var ftrSpace = createFeatureSpace(recSet.store);

	var mc = new analytics.HMC(ctmcParams);
	
	var result = HMC(mc, ftrSpace);
	result.init(recSet);
	
	return result;
};

exports.load = function (mcFName, ftrFname) {
	console.log('Loading a HMC model ...');
	
	var mc = new analytics.HMC(mcFName);
	var ftrSpace = new qm.FeatureSpace(base, ftrFname);
	
	return HMC(mc, ftrSpace);
};
