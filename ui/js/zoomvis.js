var zoomVis = function (opts) {
	
	var MODE_NORMAL = 'normal';
	var MODE_PROBS = 'probs';
	var MODE_TARGET_FTR = 'ftr';
	
	// colors
	var EDGE_COLOR = 'darkgray';
	var DEFAULT_NODE_COLOR = 'rgb(120,120,120)';//'DodgerBlue';
	var VIZ_NODE_COLOR = 360;
	var VIZ_NODE_FTR_NEG_COLOR = 360;
	var VIZ_NODE_FTR_POS_COLOR = 117;
	var CURRENT_NODE_COLOR = 'green';
	var DEFAULT_BORDER_COLOR = 'black';
	var FONT_SIZE = '12';
	
	var DEFAULT_BORDER_WIDTH = 5;
	
	var BACKGROUND_Z_INDEX = 0;
	var MIDDLEGROUND_Z_INDEX = 10;
	var FOREGROUND_Z_INDEX = 20;
	
	// size
	var MIN_NODE_DIAMETER = 40;
	
	//====================================================
	// TOOLTIPS
	//====================================================
	
	var DEFAULT_QTIP_OPTS = {
		position: {
			my: 'bottom center',
			at: 'top center'
		},
		style: {
			classes: 'qtip-bootstrap',
			tip: {
				width: 16,
				height: 8
			}
		},
		show: {
            solo: true,
            event: 'mouseover'
        },
        hide: {
        	event: 'click mouseout',
        	fixed: true
        }
	}
	
	var nodeQtipOpts = clone(DEFAULT_QTIP_OPTS);
	var edgeQtipOpts = clone(DEFAULT_QTIP_OPTS);
	
	nodeQtipOpts.content = function (event, api) { 
		var data = this.data();
		var name = data.name;
		
		var tooltip = $('<div />');
		
		// name
		if (name != null) {
			var nameDiv = $('<h3 />');
			nameDiv.html(name);
			tooltip.append(nameDiv);
		}
		
		// holding time
		var timeDiv = $('<div />');
		timeDiv.html(data.holdingTime.toPrecision(2) + ' ' + getTimeUnit() + 's');
		tooltip.append(timeDiv);
		
		// undesired event properties
		var undesiredDiv = $('<div />');
		undesiredDiv.attr('id', 'div-tooltip-undesired-' + data.id);
		undesiredDiv.addClass('tooltip-undesired');
		if ($('#div-tooltip-undesired-' + data.id).html() != null) {
			undesiredDiv.html($('#div-tooltip-undesired-' + data.id).html());
		}
		tooltip.append(undesiredDiv);
		
		var explainDiv = $('<div />');
		explainDiv.attr('id', 'div-explain-' + data.id);
		explainDiv.addClass('tooltip-div-explain');
		if ($('#div-explain-' + data.id).html() != null) {
			explainDiv.html($('#div-explain-' + data.id).html());
		}
		tooltip.append(explainDiv);
		
		setTimeout(function () {
			$.ajax('api/explanation', {
				dataType: 'json',
				method: 'GET',
				data: { stateId: data.id },
				success: function (union) {
					var score = function (interserct) {
						return interserct.covered*interserct.purity;
					}
					
					union.sort(function (inter1, inter2) {
						return score(inter2) - score(inter1);
					});
					
					var bestScore = score(union[0]);
					var lastN = 0;
					while (lastN < union.length-1 && score(union[lastN+1]) > bestScore / 10) {
						lastN++;
					}
	
					if (union.length > 1) {				
						union.splice(lastN+1);
					}
					
					// construct the rules
					var unionStr = '';
					for (var i = 0; i < union.length; i++) {
						var intersect = union[i];
						var intersectStr = '';
						var terms = intersect.terms;
						
						// sort the terms
						terms.sort(function (t1, t2) {
							if (t2.feature < t1.feature)
								return -1;
							else if (t2.feature > t1.feature)
								return 1;
							else return 0;
						});
						
						for (var j = 0; j < terms.length; j++) {
							var term = terms[j];
							
							intersectStr += '&#09;';
							
							if (term.le != null && term.gt != null) {
								intersectStr += term.feature + ' &isin; (' + toUiPrecision(term.gt) + ', ' + toUiPrecision(term.le) + ']';
							} else if (term.le != null) {
								intersectStr += term.feature + ' \u2264 ' + toUiPrecision(term.le);
							} else {
								intersectStr += term.feature + ' > ' + toUiPrecision(term.gt);
							}
						
							if (j < terms.length-1)
								intersectStr += '<br />';
						}
						
						unionStr += '<br />' + intersectStr + '<br />';
						
						if (i < union.length-1) {
							unionStr += '<br />';
						}
					}
					
					$('#div-explain-' + data.id).html(unionStr);
					api.reposition(undefined, false);
				},
				error: handleAjaxError
			});
			
			$.ajax('api/targetProperties', {
				dataType: 'json',
				method: 'GET',
				data: { stateId: data.id },
				success: function (props) {
					if (props.isUndesired) {
						$('#div-tooltip-undesired-' + data.id).html('Event id: ' + props.eventId);
					} else {
						$('#div-tooltip-undesired-' + data.id).html('');
					}
					
					api.reposition(undefined, false);
				},
				error: handleAjaxError
			});
		}, 10);
		
		
		return tooltip.html();
	};
	
	nodeQtipOpts.show.event = 'hover';
	nodeQtipOpts.hide.event = 'hovercancel';
	
	edgeQtipOpts.content = function (event) { 
		return 'Probability ' + this.data().prob.toPrecision(2)
	};
	edgeQtipOpts.show.event = 'hover';
	edgeQtipOpts.hide.event = 'hovercancel';
	
	
	var TARGET_NODE_CSS = {
		'background-image-opacity': .2,
		'background-fit': 'cover',
		'border-style': 'double'
	}
	
	var visContainer = document.getElementById(opts.visContainer);
	
	var hierarchy = null;
	var modeConfig = {
		selected: null,
		current: null,
		future: {},
		past: {},
		mode: { type: MODE_NORMAL, config: {} },
	};
	
	var drawEdgeVals = false;
	var scrollZoomEnabled = false;
	
	var uiConfig = {
		maxNodeSize: 0,
		levelMaxNodeSize: []
	}
	
	var callbacks = {
		stateSelected: function (stateId) {},
		edgeSelected: function (sourceId, targetId) {},
		zoomChanged: function (zoom) {},
		heightChanged: function (height) {}
	}
	
	var maxNodeSize = 0;
	
	var minCyZoom = .3;
	var maxCyZoom = 1.3;
	
	var ZOOM_STEPS = 100;
	var heightStep;// = 0.01;
	var zoomFactor;
	
	var minHeight = 0;
	var maxHeight = 0;
	var currentHeight = 0;
	var currentLevel = 0;
		
	var levelNodes = [];
	var levelJumps = [];
	var levelHeights = [];
	var levelCurrentStates = [];
	var levelNodeMap = {};
	
	var visWidth = visContainer.clientWidth;
	var visHeight = visContainer.clientHeight;
	var minX = 0;
	var maxX = 0;
	var minY = 0;
	var maxY = 0;
	var xOffset = .1;
	var yOffset = .1;
	
	var transitionThreshold = 1;
	
	var boundingBox = {
		x: { min: Number.MAX_VALUE, max: Number.MIN_VALUE },
		y: { min: Number.MAX_VALUE, max: Number.MIN_VALUE }
	}
	
	//===============================================================
	// UTILITY FUNCTIONS
	//===============================================================
	
	var ElementCache = function () {
		var nodeCache = {};
		
		var prevLevelNodeCache = {};
		var currLevelNodeCache = {};
		var addedNodes = [];
		
		var that = {
			addNode: function (id, level, nodeConfig) {
				nodeCache[id] = nodeConfig;
			},
			getNode: function (id) {
				return nodeCache[id];
			},
			startNewNodeLevel: function () {
				addedNodes = [];
				prevLevelNodeCache = currLevelNodeCache;
				currLevelNodeCache = {};
			},
			updateLevelNode: function (id) {
				if (!(id in currLevelNodeCache)) {
					currLevelNodeCache[id] = true;
					
					if (!(id in prevLevelNodeCache))
						addedNodes.push(nodeCache[id]);
					else
						delete prevLevelNodeCache[id];
				}
			},
			getModifiedNodes: function () {
				var removed = [];
				
				for (var id in prevLevelNodeCache) {
					removed.push(id);
				}
				
				return {
					added: addedNodes,
					removed: removed
				}
			},
			clear: function () {
				nodeCache = {};
				prevLevelNodeCache = {};
				currLevelNodeCache = {};
				addedNodes = [];
			}
		};
		
		return that;
	}
	
	var cache = ElementCache();
	
	//===============================================================
	// UTILITY FUNCTIONS
	//===============================================================
	
	function getNodeLabel(node) {
		return (node.name != null ? node.name : (node.label));
	}

	function colorFromProb(prob) {
		return prob*prob;
	}
	
	function futureColorFromProb(prob) {
		return Math.sqrt(prob);
	}
	
	function minAndMaxCoords() {
		// get the num and max of the server centers
		for (var i = 0; i < levelNodes.length; i++) {
			for (var j = 0; j < levelNodes[i].length; j++) {
				var node = levelNodes[i][j];
				var x = node.x, y = node.y;
				if (x < minX) minX = x
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
		
		// get the bounding box
		for (var i = 0; i < levelNodes.length; i++) {
			for (var j = 0; j < levelNodes[i].length; j++) {
				var node = levelNodes[i][j];
				var pos = cyPosition(node);
				var size = cySize(node.radius);
				var x = pos.x, y = pos.y;
				
				var halfW = size.width / 2;
				var halfH = size.height / 2;
				
				if (x - halfW < boundingBox.x.min) boundingBox.x.min = x - halfW;
				if (x + halfW > boundingBox.x.max) boundingBox.x.max = x + halfW;
				if (y - halfH < boundingBox.y.min) boundingBox.y.min = y - halfH;
				if (y + halfH > boundingBox.y.max) boundingBox.y.max = y + halfH;
			}
		}
	}
	
	function cyPosition(node) {
		return {
		    x: cy.width() * (xOffset + (1 - 2*xOffset) * (node.x - minX) / (maxX - minX)),
		    y: cy.height() * (yOffset + (1 - 2*yOffset) * (node.y - minY) / (maxY - minY))
		};
	}
	
	function serverPosition(pos) {
		var w = cy.width();
		var h = cy.height();
		return {
			x: minX + (pos.x - w*xOffset)*(maxX - minX) / (w*(1 - 2*xOffset)),
			y: minY + (pos.y - h*yOffset)*(maxY - minY) / (h*(1 - 2*yOffset))
		}
	}
	
	function cySize(radius) {
		var scaleX = (1 - 2*xOffset)*cy.width() / (maxX - minX);
		var scaleY = (1 - 2*yOffset)*cy.height() / (maxY - minY);
		var scale = Math.min(scaleX, scaleY);
		
		var diameter = 2*radius;
		
		return {
			width: Math.max(scale * diameter, MIN_NODE_DIAMETER),
			height: Math.max(scale * diameter, MIN_NODE_DIAMETER)
		};
	}
	
	function calcCyPan(newZoom) {
		if (newZoom < minCyZoom) newZoom = minCyZoom;
		if (newZoom > maxCyZoom) newZoom = maxCyZoom;
		
		var width = cy.width();
		var height = cy.height();
		var pan = cy.pan();
		var zoom = cy.zoom();
		
		var centerX = (width - 2*pan.x) / zoom;
		var centerY = (height - 2*pan.y) / zoom;
		
		return {
			x: (width - newZoom*centerX) / 2,
			y: (height - newZoom*centerY) / 2
		}
	}
	
	function setZoom(newZoom, fireEvent) {
		if (fireEvent == null) fireEvent = true;
		
		cy.viewport({zoom: newZoom, pan: calcCyPan(newZoom)});
		if (fireEvent) {
			callbacks.zoomChanged(newZoom);
		}
	}
	
	function setViewport(bb, fireEvent) {
		if (fireEvent == null) fireEvent = true;
				
		var cyWidth = cy.width();
		var cyHeight = cy.height();
		
		var width = bb.x.max - bb.x.min;
		var height = bb.y.max - bb.y.min;
		
		var paddingX = xOffset*cyWidth;
		var paddingY = yOffset*cyHeight;
		
		var zoom = Math.min((cyWidth - 2*paddingX) / width, (cyHeight - 2*paddingY) / height);
		var pan = { // now pan to middle
			x: (cyWidth - zoom*(bb.x.min + bb.x.max))/2,
			y: (cyHeight - zoom*(bb.y.min + bb.y.max))/2
        };
		
		cy.viewport({zoom: zoom, pan: pan});

		if (fireEvent) {
			callbacks.zoomChanged(zoom);
		}
	}
	
	//===============================================================
	// CLEAR FUNCTIONS
	//===============================================================
	
	function clear(isInBatch) {
		if (!isInBatch)
			cy.startBatch();

		cy.remove(cy.nodes());
		cy.remove(cy.edges());
		cache.clear();
		
		if (!isInBatch)
			cy.endBatch();
	}
	
	function clearStructures() {
		uiConfig.maxNodeSize = 0;
		uiConfig.levelMaxNodeSize = [];
		
		levelHeights = [];
		levelJumps = [];
		levelCurrentStates = [];
		levelNodes = [];
		levelNodeMap = {};
	}
	
	//===============================================================
	// DRAW FUNCTIONS
	//===============================================================	
	
	function drawTransitionText(edge) {
		var show = drawEdgeVals;
		
		var data = edge.data();
		var prob = data.prob;
		
		if (prob > .2 || prob == edge.source().data().maxProb)
			show = true;
		
		edge.css({ content: show ? toUiPrecision(prob) : '' });
	}
	
	function getEdgeConfig(sourceN, targetN, transitions, nodeInfo, cumProb, maxProb) {
		var sourceId = nodeInfo[sourceN].id;
		var targetId = nodeInfo[targetN].id;
		
		var id = sourceId + '-' + targetId;
		var val = transitions[targetN];
		
		var css = {
			'text-transform': 'none',
			'text-halign': 'center',
			'text-valign': 'center',
			'font-style': 'normal',
			'font-size': FONT_SIZE,
			'font-family': 'inherit',
			'font-weight': 'normal',
			'target-arrow-shape': 'triangle',
			'source-arrow-shape': 'none',
			'display': 'element',
			'haystack-radius': 0,
			'curve-style': 'bezier',
			'control-point-step-size': 100,
			'text-valign': 'top',
			'control-point-weight': 0.5,
			'line-style': 'dotted',
			'line-color': '#C0C0C0',	// light gray
			'target-arrow-color': '#C0C0C0',
			'width': Math.max(1, (val*10).toFixed()),
			'z-index': 100,
			'content': ''
		};
		
		var data = {
			id: id,
			source: sourceId,
			target: targetId,
			style: css,
			prob: val,
			cumProb: cumProb,
			maxProb: maxProb
		};
			
		return {
			group: 'edges',
			data: data,
			css: css
		};;
	}
	
	function getEdgesAboveThreshold(transitions) {
		var edges = [];
		var cumProbs = [];
		var probs = [];
		for (var k = 0; k < transitions.length; k++) {
			probs.push({prob: transitions[k], idx: k});
		}
		
		probs.sort(function (a, b) {
			return b.prob - a.prob;
		})
		
		var cumProb = 0;
		var k = 0;
		while (k < probs.length && probs[k].prob > 0 && cumProb <= transitionThreshold) {
			edges.push(probs[k].idx);
			cumProbs.push(1 - cumProb);
			cumProb += probs[k].prob;
			k++;
		}
		
		return {
			maxProb: probs[0].prob,
			edges: edges,
			cumProbs: cumProbs
		}
	}
	
	function getEdgesWithSource(sourceN, transitions, nodeInfo) {
		var result = [];
		
		var aboveThreshold = getEdgesAboveThreshold(transitions);
		var maxVal = aboveThreshold.maxProb;
		var edges = aboveThreshold.edges;
		var cumProbs = aboveThreshold.cumProbs;
		
		for (var i = 0; i < edges.length; i++) {
			var targetN = edges[i];
			result.push(getEdgeConfig(sourceN, targetN, transitions, nodeInfo, cumProbs[i], maxVal));
		}
		
		return result;
	}
	
	function getEdgesWithTarget(targetN, transitionMat, nodeInfo) {
		var result = [];
		
		for (var sourceN = 0; sourceN < transitionMat.length; sourceN++) {
			if (sourceN == targetN) continue;
			
			var aboveThreshold = getEdgesAboveThreshold(transitionMat[sourceN]);
			var maxVal = aboveThreshold.maxProb;
			var edges = aboveThreshold.edges;
			var cumProbs = aboveThreshold.cumProbs;
			
			var idx;
			if ((idx = edges.indexOf(targetN)) >= 0) {
				result.push(getEdgeConfig(sourceN, targetN, transitionMat[sourceN], nodeInfo, cumProbs[idx], maxVal));
			}
		}
		
		return result;
	}
	
	function insertLevel(level) {
		var levelInfo = levelNodes[level];
		
		cache.startNewNodeLevel();
		
		var nodeIdxs = {};
		
		// add/remove nodes
		for (var i = 0; i < levelInfo.length; i++) {
			var node = levelInfo[i];
			var id = node.id;
			
			nodeIdxs[id] = i;
						
			if (cache.getNode(id) == null) {
				var position = cyPosition(node);
				var nodeSize = cySize(levelInfo[i].radius);
				var label = getNodeLabel(node);
				
				var style = {
					'content': label,//node.label,
					'text-transform': 'none',
					'text-halign': 'center',
					'text-valign': 'center',
					'text-wrap': 'wrap',
					'font-style': 'normal',
					'font-size': 10000,	// hack, for automatic font size
					'font-family': 'inherit',
					'font-weight': 'normal',
					'shape': 'ellipse',
					'display': 'element',
					'background-color': DEFAULT_NODE_COLOR,
					'width': nodeSize.width,
					'height': nodeSize.height,
					'border-width': DEFAULT_BORDER_WIDTH,
					'border-color': DEFAULT_BORDER_COLOR,
					'label': node.label,
					'z-index': BACKGROUND_Z_INDEX					
				}
				
				if (node.isTarget) {
					for (var cssClass in TARGET_NODE_CSS) {
						style[cssClass] = TARGET_NODE_CSS[cssClass];
					}
				}
				
				var nodeConfig = {
					group: 'nodes',
					data: {
						id: '' + node.id,
						style: style,
						holdingTime: node.holdingTime,
						name: node.name
					},
					position: {
						x: position.x,
						y: position.y
					},
					css: style,
					selected: false,
					selectable: true,
					locked: false
				}
				
				cache.addNode(id, level, nodeConfig);
			}
			
			cache.updateLevelNode(id);
		}
		
		var nodesArr = cache.getModifiedNodes();
		var added = nodesArr.added;
		var removed = nodesArr.removed;
		
		var addedEdges = [];
		var removedNodeSelector = '';
		var removedEdgeSelector = '';
		
		// add/remove edges
		var takenEdgeIds = {};
		for (var i = 0; i < added.length; i++) {
			var node = added[i].data;
			var nodeN = nodeIdxs[node.id];
			
			addedEdges = addedEdges.concat(getEdgesWithSource(nodeN, levelJumps[level][nodeN], levelInfo));
		}
		
		for (var i = 0; i < addedEdges.length; i++) {
			takenEdgeIds[addedEdges[i].data.id] = true;
		}
		
		for (var i = 0; i < added.length; i++) {
			var node = added[i].data;
			var nodeN = nodeIdxs[node.id];
			
			var edges = getEdgesWithTarget(nodeN, levelJumps[level], levelInfo);
			
			for (var j = 0; j < edges.length; j++) {
				if (edges[j].data.id in takenEdgeIds) continue;
				addedEdges.push(edges[j]);
			}
		}
		
		for (var sourceN = 0; sourceN < removed.length; sourceN++) {
			var sourceId = removed[sourceN];
			var sourceIdx = nodeIdxs[sourceId];
			
			for (var targetN = 0; targetN < levelInfo.length; targetN++) {
				var targetId = levelInfo[targetN].id;
				
				removedEdgeSelector += '#' + sourceId + '-' + targetId + ',#' + targetId + '-' + sourceId;
				
				if (sourceN < removed.length-1 || targetN < levelInfo.length-1)
					removedEdgeSelector += ',';
			}
		}
		
		for (var i = 0; i < removed.length; i++) {
			removedNodeSelector += '#' + removed[i];
			if (i < removed.length-1)
				removedNodeSelector += ',';
		}
		
		// draw
		if (removedEdgeSelector.length > 0) cy.remove(cy.edges(removedEdgeSelector));
		if (removedNodeSelector.length > 0) cy.remove(cy.nodes(removedNodeSelector));
		if (added.length > 0) cy.add(added).qtip(nodeQtipOpts);
		if (addedEdges.length > 0) addedEdges = cy.add(addedEdges).qtip(edgeQtipOpts);
		
		// recolor the edges
		if (addedEdges.length > 0 || removedEdgeSelector.length > 0) {
			// recompute the probabilities
			for (var i = 0; i < addedEdges.length; i++) {
				var edge = addedEdges[i];
				var node = edge.source();
				var outEdges = node.edgesTo('');
				
				var maxProb = 0;
				for (var j = 0; j < outEdges.length; j++) {
					if (outEdges[j].data().prob > maxProb)
						maxProb = outEdges[j].data().prob;
				}
				node.data().maxProb = maxProb;
			}
			
			// recolor the most and middle probable edges
			var middle = cy.edges().filter(function () {
				var data = this.data();
				return data.prob > .2 || data.prob == this.source().data().maxProb;
			});
			var bold = middle.filter(function () {
				var data = this.data();
				return data.prob > .4 || data.prob == this.source().data().maxProb;
			});
			
			middle.css('line-style', 'solid');
			middle.css('content', 'data(prob)');
			bold.css('line-color', '#505050');
			bold.css('target-arrow-color', '#505050');
						
			// remember for later
			for (var i = 0; i < middle.length; i++) {
				var edge = middle[i];
				var prob = toUiPrecision(edge.data().prob);
				
				edge.data().style['line-style'] = 'solid';
				edge.data().style['content'] = prob;
				edge.css({ content: toUiPrecision(edge.data().prob) });
			}
			for (var i = 0; i < bold.length; i++) {
				bold[i].data().style['line-color'] = '#505050';
				bold[i].data().style['target-arrow-color'] = '#505050';
			}
		}
	}
	
	function redraw(opts) {
		if (opts == null) opts = {};
		
		if (!opts.isInBatch)
			cy.startBatch();
		
		if (!opts.keepCached)
			clear(true);
		insertLevel(currentLevel);
		
		if (!opts.isInBatch)
			cy.endBatch();
	}
	
	function redrawAll() {
		cy.startBatch();
		
		redraw({ isInBatch: true });
		redrawSpecial(true);
		
		cy.endBatch();
	}
	
	function constructLevels(data, isInit) {
		clearStructures();
		
		for (var i = 0; i < data.length; i++) {
			var states = data[i].states;
			
			levelHeights.push(data[i].height);
			levelJumps.push(data[i].transitions);
			levelCurrentStates.push({currentState: data[i].currentState, futureStates: data[i].futureStates});
			levelNodes.push(states);
			levelNodeMap[i] = {};
			
			uiConfig.levelMaxNodeSize.push(0);
			
			for (var j = 0; j < states.length; j++) {
				var node = states[j];
				
				levelNodeMap[i][node.id] = node;
				
				var size = node.raduis;
				if (size > uiConfig.maxNodeSize)
					uiConfig.maxNodeSize = states[j].raduis;
				if (size > uiConfig.levelMaxNodeSize[i])
					uiConfig.levelMaxNodeSize[i] = size;
			}
		}
		
		if (isInit) {
			maxHeight = levelHeights[levelHeights.length - 1];
			minHeight = levelHeights[0];
			
			heightStep = (maxHeight - minHeight) / ZOOM_STEPS;
		
			minAndMaxCoords();

			setViewport(boundingBox)
			
			currentHeight = maxHeight;
			currentLevel = levelHeights.length - 1;
		}
		
		redraw();
	}
	
	function setCurrentLevel(levelIdx) {
		if (modeConfig.mode.type == MODE_TARGET_FTR) {
			fetchTargetFtr(modeConfig.mode.config.targetFtr);
		}
		
		redraw({ keepCached: true });
		fetchCurrentState(hierarchy[levelIdx].height);
	}
	
	function drawNode(nodeId, batchPresent) {
		if (nodeId == null) return;
		
		if (!batchPresent)
			cy.startBatch();
		
		var node = cy.nodes('#' + nodeId);
		
		if (nodeId == modeConfig.selected) {
			node.css('border-width', '10');
			node.css('z-index', FOREGROUND_Z_INDEX);
		}
		if (nodeId == modeConfig.current) {
			node.css('backgroundColor', CURRENT_NODE_COLOR);
		}
		if (nodeId in modeConfig.past) {
			node.css('border-color', 'red');
		}
		
		if (modeConfig.mode.type == MODE_PROBS) {
			var config = modeConfig.mode.config;
			var probs = config.probs;
			var prob = probs[nodeId];
			var intens = 100*prob;//*futureColorFromProb(prob);
						
			var color = 'hsla(' + VIZ_NODE_COLOR + ',' + Math.ceil(intens) + '%, 55%, 1)';
			node.css('backgroundColor', color);
		} 
		else if (modeConfig.mode.type == MODE_TARGET_FTR) {
			var config = modeConfig.mode.config;
			var ftrVal = config.ftrVals[nodeId];
			
			var ftrRange = config.maxVal - config.minVal;
			var middleVal = config.minVal + ftrRange/2;
			
			var color;
			if (ftrVal >= middleVal) {
				var val = 2*(ftrVal - middleVal) / ftrRange;
				color = 'hsla(' + VIZ_NODE_FTR_POS_COLOR + ',' + Math.floor(100*colorFromProb(val)) + '%, 55%, 1)';
			} else {
				var val = 2*(middleVal - ftrVal) / ftrRange;
				color = 'hsla(' + VIZ_NODE_FTR_NEG_COLOR + ',' + Math.floor(100*colorFromProb(val)) + '%, 55%, 1)';
			}
//			
//			var minColor = 64;
//			var maxColor = 208;
//			
//			var range = maxColor - minColor;
//			var relValue = 1 - (ftrVal - config.minVal) / ftrRange;
//			
//			var colorVal = (minColor + relValue*range).toFixed()
//			var color = 'rgb(' + colorVal + ',' + colorVal + ',' + colorVal + ')';
						
			node.css('backgroundColor', color);
		} 
		else if (nodeId in modeConfig.future) {
			var baseColor = 216;//nodeId in specialStates.probs ? 307 : ;
			
			var prob = futureColorFromProb(modeConfig.future[nodeId]);
			var color = 'hsla(' + baseColor + ',' + (15 + Math.floor((100-15)*prob)) + '%, 55%, 1)';
			node.css('backgroundColor', color);
		}
		
		if (!batchPresent)
			cy.endBatch();
	}
	
	function clearStyles(inBatch) {
		if (!inBatch)
			cy.startBatch();
		
		var nodes = cy.nodes();
		
		nodes.css('border-color', DEFAULT_BORDER_COLOR);
		nodes.css('backgroundColor', DEFAULT_NODE_COLOR);
		nodes.css('border-color', DEFAULT_BORDER_COLOR);
		nodes.css('z-index', BACKGROUND_Z_INDEX);
		
		if (!inBatch)
			cy.endBatch();
	}
	
	function drawNodes() {
		cy.batch(function () {
			clearStyles(true);
			
			var levelInfo = levelNodes[currentLevel];
			for (var i = 0; i < levelInfo.length; i++) {
				drawNode(levelInfo[i].id, true);
			}
		});
	}
	
	function clearCurrentState() {
		clearStyles();
		
		modeConfig.current = null;
		modeConfig.future = {};
		modeConfig.past = {};
	}
	
	function redrawSpecial(isInBatch) {
		if (!isInBatch)
			cy.startBatch();
		
		var nodes = cy.nodes();
		for (var i = 0; i < nodes.length; i++) {
			var node = nodes[i];
			node.css(node.data().style);
		}
		drawNode(modeConfig.selected, true);
		drawNode(modeConfig.current, true);
		for (var nodeId in modeConfig.future)
			drawNode(nodeId, true);
		for (var nodeId in modeConfig.past)
			drawNode(nodeId, true);
		if (modeConfig.mode.type == MODE_PROBS) {
			for (var nodeId in modeConfig.mode.config.probs)
				drawNode(nodeId, true);
		}
		
		if (!isInBatch)
			cy.endBatch();
	}
	
	//===============================================================
	// SET STATES
	//===============================================================
	
	function setCurrentState(stateId, height) {
		clearCurrentState();
		modeConfig.current = stateId;
		cy.nodes('#' + stateId).select();
		
		if (modeConfig.mode.type == MODE_NORMAL)
			fetchFutureStates(stateId, height);
		fetchPastStates(stateId, height);
		
		drawNodes();
	}
	
	function setSelectedState(node) {
		var prevStateId = modeConfig.selected;
		
		if (node == null) {
			modeConfig.selected = null;
			
			cy.batch(function () {
				cy.nodes().css('border-width', DEFAULT_BORDER_WIDTH);
				
				// emphasize edges
				var edges = cy.edges();
				var nedges = edges.length;
				for (var i = 0; i < nedges; i++) {
					var edge = edges[i];
					edge.css(edge.data().style);
				}
			});
		} else {
			var stateId = parseInt(node.id());
			// set selected state
			modeConfig.selected = stateId;
			// redraw
			cy.batch(function () {
				cy.nodes().css('border-width', DEFAULT_BORDER_WIDTH);
				drawNode(stateId, true);
				
				// emphasize edges
				var edges = cy.edges();
				var nedges = edges.length;
				for (var i = 0; i < nedges; i++) {
					var edge = edges[i];
					edge.css(edge.data().style);
				}
				
				node.edgesTo('').css({
					'line-color': 'green',
					'target-arrow-color': 'green',
					'line-style': 'solid'
				});
			});
		}
		
		// notify the handler
		if (prevStateId != modeConfig.selected)
			callbacks.stateSelected(stateId, hierarchy[currentLevel].height);
	}
	
	//===============================================================
	// FETCH METHODS
	//===============================================================
	
	function fetchFutureStates(currStateId, height) {
		modeConfig.future = {};
		
		$.ajax('api/futureStates', {
			dataType: 'json',
			data: { state: currStateId, level: height },
			success: function (states) {
				for (var i = 0; i < Math.min(3, states.length); i++) {
					var stateId = states[i].id;
					
					modeConfig.future[stateId] = states[i].prob;
					drawNode(stateId);
				}
			}
		});
	}
	
	function fetchPastStates(currStateId, height) {
		modeConfig.past = {};
		
		$.ajax('api/history', {
			dataType: 'json',
			data: { state: currStateId, level: height },
			success: function (stateIds) {
				for (var i = 0; i < stateIds.length; i++) {
					var stateId = stateIds[i];
					
					modeConfig.past[stateId] = true;
					drawNode(stateId);
				}
			}
		});
	}
	
	function fetchCurrentState(height) {
		modeConfig.current = null;
		
		$.ajax('api/currentState', {
			dataType: 'json',
			data: { level: height },
			success: function (state) {
				setCurrentState(state.id, height);
			}
		});
	}
	
	function setUI(data, isInit) {
		cache.clear();
		data.sort(function (a, b) {
			return a.height - b.height;
		});
		hierarchy = data;
		constructLevels(hierarchy, isInit);
		fetchCurrentState(currentHeight);
	}
	
	function fetchUI() {
		$.ajax({
			url: 'api/model',
			success: function (data) {
				setUI(data, true);
			},	
			dataType: 'json',
			error: function (jqXHR, jqXHR, status, err) {
				alert("failed to receive object: " + status + ", " + err);
			}
		});
	}
	
	function fetchTargetFtr(ftrIdx) {
		$.ajax('api/targetFeature', {
			dataType: 'json',
			data: { height: that.getCurrentHeight(), ftr: ftrIdx },
			success: function (data) {
				var stateVals = {};
				
				var maxVal = Number.NEGATIVE_INFINITY;
				var minVal = Number.POSITIVE_INFINITY;
				
				for (var i = 0; i < data.length; i++) {
					var state = data[i].state;
					var value = data[i].value;
					
					if (value > maxVal) maxVal = value;
					if (value < minVal) minVal = value;
					
					stateVals[state] = value;
				}
				
				setMode(MODE_TARGET_FTR, { 
					targetFtr: ftrIdx,
					ftrVals: stateVals,
					maxVal: maxVal,
					minVal: minVal
				});
				
				drawNodes();
			}
		});
	}
	
	//===============================================================
	// INITIALIZE
	//===============================================================
	
	function onMouseWheel(event) {
		if (event.preventDefault) event.preventDefault();
		
		if (event.deltaY > 0) {		// scroll out
			currentHeight = Math.min(maxHeight, currentHeight + heightStep);
			
			if (currentLevel < levelHeights.length - 1) {
				if (currentHeight >= levelHeights[currentLevel + 1]) {
					setCurrentLevel(++currentLevel);
				}
			}
			
		} else {					// scroll in
			currentHeight = Math.max(minHeight, currentHeight - heightStep);
			
			if (currentLevel > 0) {
				if (currentHeight < levelHeights[currentLevel]) {
					setCurrentLevel(--currentLevel);
				}
			}
		}
		
		if (scrollZoomEnabled) {
			var zoom = cy.zoom();
			var factor = 1.01;
			var newZoom = zoom * (event.deltaY > 0 ? 1 / factor : factor);
			
			setZoom(newZoom);
		}
		
		callbacks.heightChanged((1 - (currentHeight - minHeight) / (maxHeight - minHeight)));
	}
	
	// adding mouse wheel listener
	if (visContainer.onwheel !== undefined) {
		visContainer.addEventListener('wheel', onMouseWheel)
	} else if (visContainer.onmousewheel !== undefined) {
		visContainer.addEventListener('mousewheel', onMouseWheel)
	} else {
		// unsupported browser
		alert("your browser is unsupported");
	}
	
	var cy = cytoscape({
		container: document.getElementById(opts.visContainer),
		style: [
			{
				selector: 'node',
				css: {
					'background-color': DEFAULT_NODE_COLOR,
					'text-valign': 'center',
					'font-size': FONT_SIZE
				},
			},
			{
				selector: 'edge',
				css: {
					'target-arrow-shape': 'triangle',
					'target-arrow-color': EDGE_COLOR,
					'lineColor': EDGE_COLOR
				}
			}
		],
		
		motionBlur: false,
		fit: false,
		userZoomingEnabled: false,
		boxSelectionEnabled: false,
		wheelSensitivity: 0.01,
		
		// moving the viewport
		panningEnabled: true,
		userPanningEnabled: true,
		hideEdgesOnViewport: false,
		textureOnViewport: true,
		
		minZoom: minCyZoom,
		maxZoom: maxCyZoom,
		
		ready: function() {
			fetchUI();
			
			cy.on('click', 'node', function (event) {
				var node = event.cyTarget;
				setSelectedState(node);
			});
			
			cy.on('click', function (event) {
				var target = event.cyTarget;
				if (target === cy) {
					setSelectedState(null);
				}
			})
			
			cy.on('mouseover', 'node', function (event) {
				var node = event.cyTarget;
				
				if (parseInt(node.id()) != modeConfig.selected) {
					node.css('z-index', MIDDLEGROUND_Z_INDEX);
				}
			});
			
			cy.on('mouseout', 'node', function (event) {
				var node = event.cyTarget;
				
				if (parseInt(node.id()) != modeConfig.selected) {
					node.css('z-index', BACKGROUND_Z_INDEX);
				}		
			});
			
			(function () {
				var startPos = null;
				
				function dist(p1, p2) {
					return Math.sqrt((p1.x - p2.x)*(p1.x - p2.x) + (p1.y - p2.y)*(p1.y - p2.y));
				}
				
				cy.on('grab', 'node', function (event) {
					var cyNode = event.cyTarget;
					var id = parseInt(cyNode.id());
					var pos = cyNode.position();
					
					startPos = {x: pos.x, y: pos.y};
				});
				
				// fired when a node is moved
				cy.on('free', 'node', function (event) {
					var cyNode = event.cyTarget;
					var id = parseInt(cyNode.id());
					var pos = cyNode.position();
					var serverPos = serverPosition(pos);
					
					// check if we haven't moved
					if (startPos != null) {
						var d = dist(pos, startPos);
						startPos = null;
						
						if (d < 3) {
							console.log('Moved for: ' + d + ' ignoring ...');
							return;
						}
					}	
					
					for (var level in levelNodeMap) {
						for (var nodeId in levelNodeMap[level]) {
							if (nodeId == id) {
								var node = levelNodeMap[level][nodeId];
								node.x = serverPos.x;
								node.y = serverPos.y;
							}
						}
					}
					
					console.log('node released ' + id + ', pos: ' + JSON.stringify(pos) + ', serverPos: ' + JSON.stringify(serverPos));
				});
			})();
			
			cy.on('click', 'edge', function (event) {
				var edge = event.cyTarget;
				var sourceId = edge.source().id();
				var targetId = edge.target().id();
				callbacks.edgeSelected(parseInt(sourceId), parseInt(targetId));
			});
			
			(function () {	// fix for the non-working qtip delay
				var hoverTimeout;
				var element = cy.collection();
				var isShown = false;
				
				function cancelHover() {
					clearTimeout(hoverTimeout);
					element.trigger('hovercancel');
					isShown = false;
				}
				
				cy.on('mousemove', 'edge,node', function (event) {
					element = this;
					if (!isShown) {
						if (element.group() == 'edges') {
							var offset = $(cy.container()).offset();
							var api = element.qtip('api');
							api.set('position.adjust.x', event.cyRenderedPosition.x + offset.left);
							api.set('position.adjust.y', event.cyRenderedPosition.y + offset.top);
						}
						clearTimeout(hoverTimeout); 
						hoverTimeout = setTimeout(function () {
							element.trigger('hover');
							isShown = true;
						}, 1000);
					} else {
						cancelHover();
					}
				}).on('mouseout', 'edge,node', function (event) {
					cancelHover();
				});
			})();
		}
	});
	
	function setMode(mode, config) {
		modeConfig.mode.type = mode;
		modeConfig.mode.config = config;
	}
	
	function resetMode() {
		cy.batch(function () {
			setMode(MODE_NORMAL, {});
			redraw({ keepCached: true, isInBatch: true });
			redrawSpecial(true);
		});
	}
	
	//===============================================================
	// OBJECT
	//===============================================================
	
	var that = {
		
		/*
		 * Sets a new model which is visualized. Zoom and other properties are not
		 * refreshed!
		 */
		setModel: function (data) {
			setUI(data, false);
		},
		
		setCurrentStates: function (currentStates) {
			if (hierarchy == null) return;
						
			currentStates.sort(function (a, b) {
				return a.height - b.height;
			});
			
			var currState = currentStates[currentLevel].id;
			if (currState != modeConfig.current)
				setCurrentState(currState, currentStates[currentLevel].height);
		},
		
		setTransitionThreshold: function (threshold) {
			transitionThreshold = Math.max(.5, Math.min(1, threshold));
			redrawAll();
		},
		
		setProbDist: function (dist) {
			var config = {maxProb: 0, probs: {}};
			
			for (var i = 0; i < dist.length; i++) {
				var stateId = dist[i].stateId;
				var prob = dist[i].prob;
				
				if (prob > config.maxProb) config.maxProb = prob;
				
				config.probs[stateId] = prob;
			}
			
			setMode(MODE_PROBS, config);
			redrawSpecial();
		},
		
		getMode: function () {
			return modeConfig.mode.type;
		},
		
		getNodePositions: function () {
			var posArr = [];
			var positions = {};
			
			for (var level in levelNodeMap) {
				for (var nodeId in levelNodeMap[level]) {
					var node = levelNodeMap[level][nodeId];
					
					positions[nodeId] = {
						x: node.x,
						y: node.y
					}
				}
			}
			
			for (var nodeId in positions) {
				posArr.push({ id: parseInt(nodeId), position: positions[nodeId] });
			}
			
			return posArr;
		},
		
		resetMode: resetMode,
		
		setTargetFtr: function (ftrIdx) {
			if (ftrIdx == null) {	// reset to normal mode
				resetMode();
			} else {
				fetchTargetFtr(ftrIdx);
			}
		},
		
		setTargetState: function (stateId, isTarget) {
			// find the node
			for (var levelN = 0; levelN < levelNodes.length; levelN++) {
				var levelInfo = levelNodes[levelN];
				for (var i = 0; i < levelInfo.length; i++) {
					var node = levelInfo[i];
					if (node.id == stateId) {
						node.isTarget = isTarget;
						break;
					}
				}
			}
			
			var node = cy.nodes('#' + stateId);
			if (isTarget) {
				for (var cssClass in TARGET_NODE_CSS) {
					node.css(cssClass, TARGET_NODE_CSS[cssClass]);
					cache.getNode(stateId).css[cssClass] = TARGET_NODE_CSS[cssClass];
				}
			} else {
				for (var cssClass in TARGET_NODE_CSS) {
					node.removeCss(cssClass);
					delete cache.getNode(stateId).css[cssClass];
				}
			}
		},
		
		setStateName: function (stateId, name) {
			var level = currentLevel;
			var levelInfo = levelNodes[level];
			
			var node;
			var targetNode = null;
			for (var i = 0; i < levelInfo.length; i++) {
				node = levelInfo[i];
				if (node.id == stateId) {
					node.name = name;
					targetNode = node;
				}
			}
			
			if (targetNode == null) return;
			
			var label = getNodeLabel(targetNode);
			cache.getNode(stateId).css['content'] = label;
			
			var graphNode = cy.nodes('#' + stateId);
			if (graphNode.length > 0) {
				graphNode.data().name = name;
				graphNode.css('content', getNodeLabel(targetNode));
				graphNode.flashClass('nolabel', 1);	// fix, doesn't work without this
//				graphNode.css().content = getNodeLabel(node);
			}
		},
		
		setShowTransitionProbs: function (show) {
			drawEdgeVals = show;
			
			cy.batch(function () {
				var edges = cy.edges();
				for (var i = 0; i < edges.length; i++) {
					var edge = edges[i];
					drawTransitionText(edge);
				}
			})
		},
		
		autoLayout: function () {
			var center = { x: 0, y: 0 };
			var newCenter = { x: 0, y: 0 };
			
			var nodes = cy.nodes();
			for (var i = 0; i < nodes.length; i++) {
				var cyNode = nodes[i];
				var pos = cyNode.position();
				center.x += pos.x;
				center.y += pos.y;
			}
			
			center.x /= nodes.length;
			center.y /= nodes.length;
			
			cy.layout({
				name: 'cose',
				animate: 'true',
				nodeOverlap: 500,
				useMultitasking: true,
				stop: function () {
					cy.batch(function () {
						var nodes = cy.nodes();
						for (var i = 0; i < nodes.length; i++) {
							var cyNode = nodes[i];
							var pos = cyNode.position();
							newCenter.x += pos.x;
							newCenter.y += pos.y;
						}
						
						newCenter.x /= nodes.length;
						newCenter.y /= nodes.length;
						
						var deltaCenter = { x: center.x - newCenter.x, y: center.y - newCenter.y };
						
						var nodes = cy.nodes();
						for (var i = 0; i < nodes.length; i++) {
							var cyNode = nodes[i];
							var id = parseInt(cyNode.id());
							var pos = cyNode.position();
							var newPos = { x: pos.x + deltaCenter.x, y: pos.y + deltaCenter.y }
							
							cyNode.position('x', newPos.x);
							cyNode.position('y', newPos.y);
							
							var level = currentLevel;
							var node = levelNodeMap[level][id];
							
							var serverPos = serverPosition(newPos);
							node.x = serverPos.x;
							node.y = serverPos.y;
						}
						
						var padding = parseInt(Math.min(cy.width()*xOffset, cy.height()*yOffset).toFixed());
						cy.fit(nodes, padding);
					});
				}
			})
		},
		
		setWheelScroll: function (scroll) {
			scrollZoomEnabled = scroll;
		},
		
		setZoom: function (value) {
			setZoom(value, false);
		},
		
		getZoom: function () {
			return cy.zoom();
		},
		
		getMinZoom: function () {
			return minCyZoom;
		},
		
		getMaxZoom: function () {
			return maxCyZoom;
		},
		
		getCurrentHeight: function () {
			return currentHeight;
		},
		
		getCurrentState: function () {
			return modeConfig.current;
		},
		
		getSelectedState: function () {
			return modeConfig.selected;
		},
		
		getPNG: function () {
			return cy.png( {full: true, scale: 1} );
		},
		
		// callbacks
		onStateSelected: function (callback) {
			callbacks.stateSelected = callback;
		},
		
		onEdgeSelected: function (callback) {
			callbacks.edgeSelected = callback;
		},
		
		onZoomChanged: function (callback) {
			callbacks.zoomChanged = callback;
		},
		
		onHeightChanged: function (callback) {
			callbacks.heightChanged = callback;
		}
	}
	
	return that;
}
