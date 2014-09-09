api.schema2js = schema2js;
var ErrorCodes = api.ErrorCodes = schema2js.ErrorCodes;

function pointerEscape(key) {
	return key.replace(/~/g, "~0").replace(/\//g, "~1");
}
function pointerUnescape(key) {
	return key.replace(/~1/g, "/").replace(/~0/g, "~");
}
function splitHeader(value) {
	if (value == null) return [];
	return value.match(/(^|,)(([^,\\"]|"([^"\\]|\\.)*"?)*)/g).map(function (value) {
		return value.replace(/^,?\s*/, '');
	});
}
function parseLink(linkFormat) {
	var href = linkFormat.match(/^\s*<([^>]*)>/) || null;
	var result = {href: href[1] || null};
	var remainder = linkFormat.replace(/^[^>]+>\s*;?/, '');
	remainder.match(/(^|;)(([^;\\"]|"([^"\\]|\\.)*"?)*)/g).map(function (part) {
		part = part.replace(/^\s*(;\s*)?/, '');
		var key = part.replace(/\=.*/, '');
		var remainder = part.substring(key.length).replace(/(^\s*=\s*|\s+$)/g, '');
		if (remainder.charAt(0) === '"') {
			try {
				remainder = JSON.parse(remainder);
			} catch (e) {
				// do nothing
			}
		}
		result[key] = result[key] || remainder;
	});
	return result;
}
function parseQuery(queryString) {
	var result = {};
	(queryString.match(/(^\??|&)([^&]+)/g) || []).forEach(function (part) {
		part = part.substring(1);
		var key = part.split('=', 1)[0];
		var value = part.substring(key.length + 1);
		result[decodeURIComponent(key)] = decodeURIComponent(value);
	});
	return result;
}
function encodeQuery(query) {
	var parts = [];
	for (var key in query) {
		parts.push(encodeURIComponent(key) + '=' + encodeQueryComponent(query[key]));
	}
	return parts.length ? ('?' + parts.join('&')) : '';
}
function encodeQueryComponent(str) {
	return encodeURIComponent(str).replace(/%2F/gi, '/');
}
var asap = (typeof process === 'object' && typeof process.nextTick === 'function') ? process.nextTick.bind(process) : function (func) {
	setTimeout(func, 0);
};
var timerWait = function (minGapMs, maxWaitMs, listener) {
	if (typeof maxWaitMs === 'function') {
		listener = maxWaitMs;
		maxWaitMs = minGapMs;
		minGapMs = null;
	}
	var longTimer = null, shortTimer = null;
	return function () {
		var thiz = this, args = arguments;
		var execute = function () {
			clearTimeout(longTimer);
			clearTimeout(shortTimer);
			longTimer = shortTimer = null;
			listener.apply(thiz, args);
		};
		if (minGapMs) {
			if (shortTimer) clearTimeout(shortTimer);
			shortTimer = setTimeout(execute, minGapMs);
		}
		longTimer = longTimer || setTimeout(execute, maxWaitMs);
	};
};

var parseUrl = schema2js.util.parseUrl;
var resolveUrl = schema2js.util.resolveUrl;
var relativeUrl = function (base, href, keepAbsolutePath) {
	href = resolveUrl(base, href);
	var loc = base;
	if (!keepAbsolutePath && href === loc) return;
	var locParsed = parseUrl(loc);
	var domain = locParsed.protocol + locParsed.authority;
	var path = base.replace(/[#?].*/g, '').replace(/\/$/, '');
	if (!keepAbsolutePath && href.substring(0, path.length) === path) {
		href = href.substring(path.length);
	} else if (href.substring(0, domain.length) === domain) {
		href = href.substring(domain.length);
	}
	return href;
};

api.util = {
	pointerEscape: pointerEscape,
	pointerUnescape: pointerUnescape,
	splitHeader: splitHeader,
	parseLink: parseLink,
	url: {
		parse: parseUrl,
		resolve: resolveUrl,
		relative: relativeUrl,
		parseQuery: parseQuery,
		encodeQuery: encodeQuery,
		encodeQueryComponent: encodeQueryComponent
	},
	timer: {
		asap: asap,
		wait: timerWait
	}
};

// Quick+dirty EventEmitter class
function EventEmitter() {
}
EventEmitter.prototype = {
	on: function (event, listener) {
		this._events = this._events || {};
		this._events[event] = this._events[event] || [];
		this._events[event].push(listener);
		this.emit('newListener', event, listener);
		return this;
	},
	once: function (event, listener) {
		var selfRemovingListener = function () {
			this.off(event, selfRemovingListener);
			listener.apply(this, arguments);
		};
		return this.on(event, selfRemovingListener);
	},
	off: function (event, listener) {
		if (!listener) {
			if (!event) {
				for (event in this._events || {}) {
					this.off(event);
				}
			} else {
				var listeners = (this._events && this._events[event]) || [];
				while (listeners.length) {
					this.emit('removeListener', event, listeners.shift());
				}
				this._events[event] = [];
			}
		} else if (event) {
			this._events = this._events || {};
			this._events[event] = this._events[event] || [];
			var index = this._events[event].indexOf(listener);
			if (index !== -1) {
				this._events[event].splice(index, 1);
			}
			this.emit('removeListener', event, listener);
		}
		return this;
	},
	removeListener: function (event, listener) {
		if (typeof listener !== 'function') throw new Error('Listener must be function');
		return this.off(event, listener);
	},
	emit: function (event) {
		var args = Array.prototype.slice.call(arguments, 1);
		if (this._events && this._events[event]) {
			var listeners = this._events[event].slice();
			while (listeners.length) {
				var listener = listeners.shift();
				listener.apply(this, args);
			}
			return true;
		}
		return false;
	}
};
EventEmitter.prototype.addListener = EventEmitter.prototype.on;
EventEmitter.prototype.removeAllListeners = EventEmitter.prototype.off;
EventEmitter.addMethods = function (obj) {
	for (var key in EventEmitter.prototype) {
		obj[key] = EventEmitter.prototype[key];
	}
	return obj;
};
api.EventEmitter = EventEmitter;

var errorRequestFunction = function (params) {throw new Error('Requests not enabled - try JsonModel.setRequestFunction(func):\n' + JSON.stringify(params));};
var suppliedRequestFunction = errorRequestFunction;
function requestFunction(params, callback) {
	return suppliedRequestFunction(params, callback);
}
api.setRequestFunction = function (func) {
	suppliedRequestFunction = func || errorRequestFunction;
};

var schemaStore, generator, generatedClasses;
var generatorConfig = {classes: false, assignment: true, linkAssignment: true, trackMissing: true, schemaStore: schemaStore, directMethods: false};
var clean = api.clean = function setupClean(callback) {
	if (callback) {
		// If possible, delay cleaning until schemas fetched
		return whenSchemasFetched(function () {
			clean();
			callback();
		});
	}
	requestErrors = {};
	pendingRequests = {};
	var config = Object.create(generatorConfig);
	config.schemaStore = schemaStore = api.schemaStore = new schema2js.SchemaStore();
	generator = new schema2js.Generator(config);
	generatedClasses = generator.classes(null, requestFunction);
	api.setRequestFunction(null);
};
clean();

api.validator = function (schema, callback) {
	callback = callback || function () {};
	var transform = function (validatorErrors) {
		return function (data) {
			var schemaMap = {};
			var linkMap = {};
			var missingMap = {};
			var errors = validatorErrors(data, "", schemaMap, linkMap, missingMap);
			return {valid: !errors.length, errors: errors, schemas: schemaMap, links: linkMap, missing: missingMap};
		};
	};
	
	var result = transform(api.validationErrors(schema, function (error) {
		callback(error, result);
	}));
	return result;
};
api.validationErrors = function (schema, callback) {
	callback = callback || function () {};
	if (typeof schema === 'string') {
		if (generator.missing(schema)) {
			generator.addSchema(schema);
		}
		var name = generator.classNameForUrl(schema);
		var validator = function (data, dataPath, schemaMap, linkMap, missingMap) {
			if (generatedClasses[name]) {
				return generatedClasses[name].validationErrors(data, dataPath, schemaMap, linkMap, missingMap);
			} else {
				if (schemaMap) {
					schemaMap[''] = schemaMap[''] || [];
					schemaMap[''].push(schema);
				}
				if (missingMap) {
					missingMap[''] = missingMap[''] || [];
					missingMap[''].push(schema);
				}
				return [];
			}
		};
		whenSchemasFetched(function () {
			callback(null, validator);
		});
		return validator;
	} else {
		var anonymousGen = new schema2js.Generator(generatorConfig);
		var className = 'AnonymousSchema';
		anonymousGen.addSchema(schema, className);
		var classes = anonymousGen.classes();
		var validator = classes[className].validationErrors;

		var missing = anonymousGen.missing();
		// Make sure the main generator will have/fetch all the appropriate schemas
		missing.forEach(function (url) {
			if (generator.missing(url)) {
				generator.addSchema(url);
			}
		});
		
		// This block goes first, because if we actually have all the schemas already, it might trigger a sychronous regeneration
		whenSchemasFetched(function () {
			missing.forEach(function (url) {
				var className = generator.classNameForUrl(url);
				classes[anonymousGen.classNameForUrl(url)] = generatedClasses[className];
			});
			callback(null, validator);
		});
		missing.forEach(function (url) {
			var className = generator.classNameForUrl(url);
			if (generatedClasses[className]) {
				classes[anonymousGen.classNameForUrl(url)] = generatedClasses[className];
			}
		});
		return validator;
	}
};

function SchemaSet(schemas) {
	// TODO: expandAllOf flag
	this._schemas = schemas;
	this._props = {};
	this._patterns = {};
}
SchemaSet.prototype = {
	_cache: function (method, result) {
		this[method] = function () {
			return result;
		};
		return result;
	},
	_cacheArray: function (method, result) {
		this[method] = function () {
			return result.slice(0);
		};
		return result.slice(0);
	},
	titles: function () {
		return this._cacheArray('titles', this._schemas.map(function (schema) {
			return schema.title;
		}));
	},
	knownKeys: function (key) {
		var keys = [], props = {};
		function addKey(key) {
			if (!props[key]) {
				props[key] = true;
				keys.push(key);
			}
		}
		this._schemas.forEach(function (schema) {
			(schema.propertyOrder || []).forEach(addKey);
			(schema.required || []).forEach(addKey);
			for (var key in schema.properties || {}) {
				addKey(key);
			}
		});
		return keys;
	},
	prop: function (key) {
		if (this._props[key]) return this._props[key];
		
		var newSchemas = [];
		for (var i = 0; i < this._schemas.length; i++) {
			var schema = this._schemas[i];
			var found = false;
			if (schema.properties && schema.properties[key]) {
				newSchemas.push(schema.properties[key]);
				found = true;
			}
			if (schema.patternProperties) {
				for (var pattern in patternProperties) {
					var regexp = this._patterns[pattern] = this._patterns[pattern] || new RegExp(pattern);
					if (regexp.test(key)) {
						newSchemas.push(schema.patternProperties[pattern]);
						found = true;
					}
				}
			}
			if (!found && 'additionalProperties' in schema) {
				if (!schema.additionalProperties) {
					newSchemas = [false];
					break;
				}
			}
		}
		return this._props[key] = new SchemaSet(newSchemas);
	},
	item: function (index) {
		var newSchemas = [], individual = false;
		
		for (var i = 0; i < this._schemas.length; i++) {
			var schema = this._schemas[i];
			if (schema.items) {
				if (Array.isArray(schema.items)) {
					individual = true;
					throw new Error('array tuples not supported yet');
				} else {
					newSchemas.push(schema.items);
				}
			}
		}
		
		if (!individual) {
			return this._cache('item', new SchemaSet(newSchemas));
		} else {
			throw new Error('Array tuples not supported yet');
		}
	}
};

function resolvePointer(path, valueTarget) {
	var pathParts = path.split('/').slice(1).map(pointerUnescape);
	var finalKey = pathParts.pop();
	for (var i = 0; i < pathParts.length; i++) {
		var key = pathParts[i];
		if (valueTarget && typeof valueTarget === 'object') {
			valueTarget = valueTarget[key];
		} else {
			finalKey = null;
			break;
		}
	}
	return {target: valueTarget, key: finalKey};
}

function RootModel(dataStore, storeKey) {
	var thisRootModel = this;
	this.dataStore = dataStore;
	this.storeKey = storeKey;
	this.state = Date.now(); // Just an arbitrary number

	var pendingPoke = null;
	function pokeNow() {
		dataStore._pokeRootModel(storeKey, thisRootModel);
	}
	function clearPoke() {
		pendingPoke = null;
	}
	var pokeStore = this.pokeStore = function () {
		pendingPoke = pendingPoke || pokeNow() || asap(clearPoke) || true;
	};
	
	// Hypertext metadata
	this.url = null;
	this.http = {
		status: null,
		headers: {}
	};

	// ready state
	this.ready = true;
	var whenReadyCallbacks = [];
	this.whenReady = function (callback) {
		if (this.ready) return asap(callback);
		whenReadyCallbacks.push(callback);
	};
	var pendingOperations = 0;
	this.pendingOperation = function () {
		this.ready = false;
		pendingOperations++;
		return decrementPendingOperations;
	};
	function decrementPendingOperations() {
		if (!--pendingOperations) {
			thisRootModel.ready = true;
			while (whenReadyCallbacks.length) {
				whenReadyCallbacks.shift()();
			}
		}
	};
	
	var value = null;
	var validatorFunctions = [];
	var schemaMap = {};
	var schemaSetCache = {};
	var linkMap = {};
	var missingSchemas = {};
	var errors = [];
	var pendingSchemaRecalculate = false;

	function recalculateSchemas() {
		schemaMap = {};
		linkMap = {};
		missingSchemas = {};
		errors = [];
		// Recalculate schemas (from scratch for now - TODO: we'll improve this later!)
		for (var i = 0; i < validatorFunctions.length; i++) {
			errors = errors.concat(validatorFunctions[i](value, "", schemaMap, linkMap, missingSchemas));
		}
	}
	// Trigger schema-change events for a tree (with optional ignored child)
	function checkSchemaChanges(path, modelSet, ignoreKey, oldSchemaMap) {
		var oldSchemas = oldSchemaMap[path] || [];
		var newSchemas = schemaMap[path] || [];
		var added = [], removed = [];
		for (var i = 0; i < oldSchemas.length; i++) {
			if (newSchemas.indexOf(oldSchemas[i]) === -1) {
				removed.push(oldSchemas[i]);
			}
		}
		for (var i = 0; i < newSchemas.length; i++) {
			var schemaUrl = newSchemas[i];
			if (oldSchemas.indexOf(schemaUrl) === -1) {
				added.push(schemaUrl);
			}
		}
		if (added.length || removed.length) {
			if (modelSet.m) {
				modelSet.m.emit('schemachange', added, removed);
			}
			for (var key in modelSet.c) {
				if (ignoreKey === null || key !== ignoreKey) {
					checkSchemaChanges(path + "/" + pointerEscape(key), modelSet.c[key], null, oldSchemaMap);
				}
			}
		}
	}
	
	// TODO: emit relative JSON Pointer for parent changes?
	function childValueChanges(modelSet) {
		for (var key in modelSet.c) {
			var childModelSet = modelSet.c[key];
			if (childModelSet.m) {
				childModelSet.m.emit('change', '');
			}
			childValueChanges(childModelSet)
		}
	}
	
	this.reset = function (value, schemas) {
		pendingOperations++;
		validatorFunctions = (schemas || []).map(function (schema) {
			pendingOperations++;
			if (typeof schema === 'string') {
				schema = resolveUrl(thisRootModel.url || this.dataStore.baseUrl, schema);
			}
			return api.validationErrors(schema, decrementPendingOperations);
		});
		this.ready = (pendingOperations <= 1) && !validatorFunctions.length || api.schemasFetched();
		this.setPathValue('', value);
		asap(decrementPendingOperations);
	};
	
	var models = {c: {}};
	this.modelForPath = function (path) {
		var pathParts = path.split('/').slice(1).map(pointerUnescape);
		var target = models;
		for (var i = 0; i < pathParts.length; i++) {
			var key = pathParts[i];
			target = target.c[key] = target.c[key] || {c: {}};
		}
		return target.m = target.m || new Model(this, path);
	}
	
	this.setPathValue = function (path, newValue) {
		this.state--;
		pokeStore();
		if (!path) {
			value = newValue;
		} else {
			var resolved = resolvePointer(path, value);
			if (resolved.target && typeof resolved.target === 'object') {
				if (resolved.target[resolved.key] === newValue) {
					return true;
				} else if (typeof newValue === 'undefined') {
					delete resolved.target[resolved.key];
				} else {
					resolved.target[resolved.key] = newValue;
				}
			} else {
				return false;
			}
		}
		
		// Parent+child value+schema changes
		var oldSchemaMap = schemaMap;
		recalculateSchemas();
		var pathParts = path.split('/');
		var modelSet = models;
		for (var i = 1; i <= pathParts.length; i++) {
			var partialPath = pathParts.slice(0, i).join('/');
			var nextKey = null;
			if (partialPath !== path) {
				nextKey = pointerUnescape(pathParts[i]);
			}
			checkSchemaChanges(partialPath, modelSet, nextKey, oldSchemaMap);
			if (modelSet.m) {
				modelSet.m.emit('change', path.substring(partialPath.length));
			}
			if (nextKey !== null) {
				modelSet = modelSet.c[nextKey];
				if (!modelSet) break;
			} else {
				// End of the queue, so iterate into children
				childValueChanges(modelSet);
			}
		}
		
		if (!this.ready && !pendingSchemaRecalculate) {
			pendingSchemaRecalculate = true;
			// We un-shift (instead of using whenReady) to make sure it executes first, before any other callbacks
			whenReadyCallbacks.unshift(function () {
				schemaSetCache = {};
				pendingSchemaRecalculate = false;
				var oldSchemaMap = schemaMap;
				recalculateSchemas();
				checkSchemaChanges('', models, null, oldSchemaMap);
			});
		}
		return true;
	};
	this.getPathValue = function (path) {
		pokeStore();
		if (!path) {
			return value;
		}
		var resolved = resolvePointer(path, value);
		if (resolved.target && typeof resolved.target === 'object') {
			return resolved.target[resolved.key];
		} else {
			return undefined;
		}
	};
	this.getPathSchemas = function (path) {
		return (schemaMap[path] || []).slice(0);
	};
	this.getPathSchemaSet = function (path) {
		var schemas = schemaMap[path] || [];
		var key = schemas.join('\n');
		var allStrings = schemas.every(function (schema) {
			return typeof schema === 'string';
		});
		if (allStrings) {
			return schemaSetCache[key] = schemaSetCache[key] || new SchemaSet(schemas.map(function (schema) {
				return schemaStore.get(schema);
			}));
		}
		throw new Error('Non-string schemas not supported yet');
	};
	this.getPathLinks = function (path, filter) {
		var thisRootModel = this;
		var result = linkMap[path] || [];
		if (!path && this.http.headers.link) {
			result = result.concat(splitHeader(this.http.headers.link).map(parseLink));
		}
		return result.filter(function (link) {
			if (typeof filter === 'string' && filter !== link.rel) return false;
			return true;
		}).map(function (link) {
			return new Link(thisRootModel, link);
		});
	};
	this.getPathErrors = function (path, includeSchemaErrors, immediateOnly) {
		path = path || "";
		var result = errors.filter(function (error) {
			return error.path == path
				|| (!immediateOnly && error.path.substring(0, path.length) == path
					&& error.path.charAt(path.length) == '/');
		});
		if (includeSchemaErrors) {
			for (var dataPath in missingSchemas) {
				if (dataPath == path
					|| (!immediateOnly && dataPath.substring(0, path.length) == path
						&& dataPath.charAt(path.length) == '/')) {
					missingSchemas[dataPath].forEach(function (schemaUrl) {
						var baseUrl = schemaUrl.replace(/#.*/, '');
						if (requestErrors[baseUrl]) {
							result.push({
								code: ErrorCodes.SCHEMA_FETCH_ERROR,
								path: dataPath,
								params: {message: requestErrors[baseUrl].message, status: (requestErrors[baseUrl].httpStatus || null)},
								schema: schemaUrl
							});
						} else {
							result.push({
								code: ErrorCodes.SCHEMA_MISSING,
								path: dataPath,
								params: {},
								schema: schemaUrl
							});
						}
					});
				}
			}
		}
		return result;
	};
}
RootModel.prototype = {
};

function normPathSpec(pathSpec) {
	if (pathSpec == null) pathSpec = "";
	pathSpec = pathSpec + "";
	if (pathSpec && pathSpec.charAt(0) !== "/") {
		pathSpec = "/" + pointerEscape(pathSpec);
	}
	return pathSpec;
}

function Model(rootModel, path) {
	this._root = rootModel;
	this._path = path;
}
Model.prototype = {
	url: function () {
		return this._root.url + (this._path && ('#' + encodeURI(this._path)));
	},
	resolveUrl: function (url) {
		return resolveUrl(this._root.url, url);
	},
	relativeUrl: function (url, keepAbsolutePath) {
		return relativeUrl(this._root.url, url, keepAbsolutePath);
	},
	httpStatus: function (status) {
		return this._root.http.status;
	},
	httpHeaders: function (callback, split) {
		if (typeof callback === 'boolean') {
			split = callback;
			callback = null;
		}
		var headers = this._root.http.headers;
		var result = {};
		for (var key in headers) {
			result[key] = split ? splitHeader(headers[key]) : headers[key];
			if (callback) {
				callback(key, result[key]);
			}
		}
		return result;
	},
	httpHeader: function (key, split) {
		var result = this._root.http.headers[key.toLowerCase()] || null;
		return split ? splitHeader(result) : result;
	},
	ready: function () {
		return this._root.ready;
	},
	whenReady: function (callback) {
		this._root.whenReady(callback.bind(null, null, this));
	},
	get: function (pathSpec) {
		return this._root.getPathValue(this._path + normPathSpec(pathSpec));
	},
	set: function (pathSpec, value) {
		if (arguments.length < 2) {
			value = pathSpec;
			pathSpec = "";
		}
		return this._root.setPathValue(this._path + normPathSpec(pathSpec), value);
	},
	up: function (levels) {
		if (typeof levels !== 'number') {
			levels = 1;
		}
		var parts = this._path.split('/');
		parts = parts.slice(0, parts.length - levels);
		return this._root.modelForPath(parts.join('/'));
	},
	path: function (pathSpec) {
		return this._root.modelForPath(this._path + normPathSpec(pathSpec));
	},
	pointer: function () {
		return this._path;
	},
	length: function (pathSpec) {
		var value = this.get(pathSpec);
		if (Array.isArray(value)) return value.length;
		return 0;
	},
	item: function (index) {
		return this._root.modelForPath(this._path + '/' + pointerEscape(index + ''));
	},
	items: function (callback) {
		var length = this.length();
		for (var i = 0; i < length; i++) {
			callback(this.item(i), i);
		}
		return this;
	},
	map: function (callback) {
		var result = [];
		this.items(function (item, i) {
			var entry = callback(item, i);
			if (typeof entry !== 'undefined') {
				result.push(entry);
			}
		});
		return result;
	},
	keys: function (pathSpec) {
		var value = this.get(pathSpec);
		if (!value || Array.isArray(value) || typeof value !== 'object') return [];
		return Object.keys(value);
	},
	has: function (pathSpec) {
		return this.jsonType(pathSpec) !== 'undefined';
	},
	prop: function (key) {
		return this._root.modelForPath(this._path + '/' + pointerEscape(key + ''));
	},
	props: function (keys, callback) {
		if (typeof keys === 'function') {
			callback = keys;
			keys = null;
		}
		keys = keys || this.keys();
		for (var i = 0; i < keys.length; i++) {
			callback(this.prop(keys[i]), keys[i], i);
		}
		return this;
	},
	mapProps: function (keys, callback) {
		if (typeof keys === 'function') {
			var result = {};
			this.props(function (prop, key, index) {
				var entry = keys(prop, key, index);
				if (typeof entry !== 'undefined') {
					result[key] = entry;
				}
			});
			return result;
		} else {
			var result = [];
			for (var i = 0; i < keys.length; i++) {
				var entry = callback(this.prop(keys[i]), keys[i], i);
				if (typeof entry !== 'undefined') {
					result.push(entry);
				}
			}
			return result;
		}
	},
	schemas: function (pathSpec) {
		return this._root.getPathSchemas(this._path + normPathSpec(pathSpec));
	},
	schemaSet: function (pathSpec) {
		return this._root.getPathSchemaSet(this._path + normPathSpec(pathSpec));
	},
	links: function (filter) {
		return this._root.getPathLinks(this._path, filter);
	},
	link: function (filter, index) {
		return this.links(filter)[index || 0] || null;
	},
	hasSchema: function (pathSpec, url) {
		if (typeof url !== 'string') {
			url = pathSpec;
			pathSpec = null;
		}
		return this.schemas(pathSpec).indexOf(url) !== -1;
	},
	errors: function (pathSpec, includeSchemaErrors, exactOnly) {
		if (pathSpec === true || pathSpec === false) {
			exactOnly = includeSchemaErrors;
			includeSchemaErrors = pathSpec;
			pathSpec = "";
		} else if (pathSpec == null) {
			pathSpec = "";
		}
		pathSpec = pathSpec + "";
		if (pathSpec && pathSpec.charAt(0) !== "/") {
			pathSpec = "/" + pointerEscape(pathSpec);
		}
		return this._root.getPathErrors(this._path + pathSpec, includeSchemaErrors, exactOnly);
	},
	jsonType: function (pathSpec) {
		var value = this.get(pathSpec);
		if (value === undefined) return 'undefined';
		if (value === null) return 'null';
		if (Array.isArray(value)) return 'array';
		return typeof value;
	},
	toJSON: function () {
		return this.get();
	}
};
EventEmitter.addMethods(Model.prototype);

function Link(rootModel, obj) {
	this._root = rootModel;
	this.href = resolveUrl(rootModel.url, obj.href);
	this.rel = obj.rel;
	this.method = obj.method || 'GET';
}
Link.prototype = {
	open: function (data, callback) {
		if (typeof data === 'function') {
			callback = data;
			data = null;
		}
		return this._root.dataStore.open(this, callback);
	}
};

var pendingRequests = {};
var requestErrors = {};
var whenAllSchemasFetchedCallbacks = [];
function checkSchemasFetched(skipCallbacks) {
	var pendingUrls = Object.keys(pendingRequests);
	if (pendingUrls.length === 0) {
		generatedClasses = generator.classes(null, requestFunction);
		if (generator.missing().length) {
			// induce another round of requests
			return whenSchemasFetched();
		}
		while (!skipCallbacks && whenAllSchemasFetchedCallbacks.length) {
			var callback = whenAllSchemasFetchedCallbacks.shift();
			callback();
		}
	}
}
api.schemasFetched = function () {
	return !generator.missing().length;
};
var whenSchemasFetched = api.whenSchemasFetched = function whenSchemasFetched(callback) {
	if (callback) {
		whenAllSchemasFetchedCallbacks.push(callback);
	}
	generator.missing().forEach(function (missingUrl) {
		var baseUrl = missingUrl.replace(/#.*/, '');
		if (!schemaStore.missing(missingUrl) || !schemaStore.missing(baseUrl)) {
			return checkSchemasFetched(true);
		}
		missingUrl = baseUrl;
		
		if (pendingRequests[missingUrl]) return;
		pendingRequests[missingUrl] = true;
		requestFunction({method: 'GET', url: missingUrl}, function (error, data, status) {
			delete pendingRequests[missingUrl];
			if (error) {
				if (typeof console !== 'undefined' && console.error) {
					console.error('Error fetching ' + missingUrl + ':', error);
				}
				error.httpStatus = error.httpStatus || status;
				requestErrors[missingUrl] = error;
				generator.addSchema(missingUrl, null);
			} else {
				generator.addSchema(missingUrl, data || null);
			}
			checkSchemasFetched();
		});
	});
	// We might have all the schemas anyway, but need a refresh, so regenerate the schemas only
	checkSchemasFetched(true);
	asap(checkSchemasFetched);
}

function DataStore(parent, baseUrl) {
	if (typeof parent === 'string') {
		baseUrl = parent;
		parent = null;
	}
	this.baseUrl = baseUrl || (parent ? parent.baseUrl : '');
	this.parent = parent;
	this.config = parent ? Object.create(parent.config) : {
		keepMs: 1000
	}
	this._store = parent ? Object.create(parent._store) : {};
	this._removeTimeouts = {};
}
DataStore.prototype = {
	normParams: function (params) {
		if (typeof params === 'string') return this.normParams({url: params});
		return {
			url: resolveUrl(this.baseUrl, (params.url || params.href)).replace(/#.*/, ''),
			fragment: (params.url || params.href).replace(/[^#]*#?/, ''),
			method: (params.method || 'GET').toUpperCase(),
			headers: params.headers || {},
			targetSchema: ((params.targetSchema || params.hint) ? [params.targetSchema || params.hint] : [])
		};
	},
	_pokeRootModel: function (storeKey, model) {
		var thisStore = this;
		this._store[storeKey] = this._store[storeKey] || model;
		clearTimeout(this._removeTimeouts[storeKey]);
		this._removeTimeouts[storeKey] = setTimeout(function () {
			delete thisStore._store[storeKey];
			delete thisStore._removeTimeouts[storeKey];
		}, this.config.keepMs);
		return model;
	},
	_getRootModel: function (storeKey, create, keepMs) {
		if (this._store[storeKey]) return this._store[storeKey];
		if (create) {
			return this._store[storeKey] = this._pokeRootModel(storeKey, new RootModel(this, storeKey));
		}
		return null;
	},
	_keyForParams: function (params) {
		return params.method + ' ' + params.url;
	},
	open: function (params, callback) {
		var thisStore = this;
		
		params = this.normParams(params);
	
		if (params.fragment && params.fragment.charAt(0) !== '/') {
			throw new Error('Non-pointer fragments not currently supported: #' + params.fragment);
		}
		
		var storeKey = this._keyForParams(params);
		var cached = this._getRootModel(storeKey);
		var rootModel = this._getRootModel(storeKey, true);
		rootModel.url = params.url;
		var model = rootModel.modelForPath(params.fragment || '');
		if (cached) {
			console.log('Cached:', storeKey);
			if (callback) model.whenReady(callback);
			return model;
		}

		var pendingDone = rootModel.pendingOperation();
		requestFunction(params, function (error, data, status, headers) {
			var schemas = [];
			var newHeaders = {};
			for (var key in headers || {}) {
				newHeaders[key.toLowerCase()] = headers[key] + "";
			}
			splitHeader(newHeaders.link).forEach(function (link) {
				var link = parseLink(link);
				if (link.rel.toLowerCase() === 'describedby') {
					schemas.push(link.href);
				}
			});
			if (!schemas.length && !error) {
				schemas = [];
				if (params.targetSchema) schemas.push(params.targetSchema);
			}
		
			rootModel.reset((typeof data !== 'undefined') ? data : null, schemas);
			rootModel.http = {status: status || null, headers: newHeaders};
			pendingDone();

			if (callback) {
				model.whenReady(function () {
					callback(error, model);
				});
			}
		});
		
		return model;
	},
	create: function (initialValue, url, schemas, callback) {
		// Argument juggling
		if (Array.isArray(url)) {
			callback = schemas;
			schemas = url;
			url = null;
		}
		if (typeof url === 'function') {
			callback = url;
			url = schemas = null;
		} else if (typeof schemas === 'function') {
			callback = schemas;
			schemas = null;
		}
		if (typeof url !== 'string') {
			url = 'tmp://' + Math.random().toString().substring(2);
		}
		if (typeof schemas === 'string' || (schemas && typeof schemas === 'object' && !Array.isArray(schemas))) schemas = [schemas];
		schemas = schemas || [];

		// Actual logic
		var params = this.normParams(url);
		if (params.fragment) throw new Error('URL fragments not allowed in create()');

		var key = this._keyForParams(params);
		var rootModel = this._getRootModel(key, true);
		var model = rootModel.modelForPath('');

		rootModel.url = params.url;
		rootModel.reset(initialValue, schemas);
		rootModel.http = {status: null, headers: {}};
		
		if (callback) {
			model.whenReady(callback);
		}
		return model;
	}
};

api.dataStore = new DataStore();
if (typeof window !== 'undefined' && window && window.location && typeof window.location.href === 'string') {
	api.dataStore.baseUrl = window.location.href;
}

api.open = function (params, hintSchemas, callback) {
	return api.dataStore.open(params, hintSchemas, callback);
};
api.create = function (initialValue, url, schemas, callback) {
	return api.dataStore.create(initialValue, url, schemas, callback);
};
api.extend = function (obj) {
	Object.keys(obj).forEach(function (key) {
		Model.prototype[key] = obj[key];
	});
};
api.is = function (potentialModel) {
	return potentialModel instanceof Model;
};

// Default request function in browser
if (typeof XMLHttpRequest === 'function') {
	api.setRequestFunction(function (params, callback) {
		if (params.method !== 'GET') throw new Error('Only GET supported for now');
		
		var request = new XMLHttpRequest();
		try {
			request.open(params.method, params.url, true, params.user, params.password);
		} catch (e) {
			return asap(function () {
				callback(e);
			});
		}
		request.responseType = 'text';
		request.onreadystatechange = function () {
			if (request.readyState !== 4) return;
			var error = null;
			if (request.status < 200 || request.status > 299) {
				error = new Error(request.status + ' ' + request.statusText);
			}
			var headers = {};
			request.getAllResponseHeaders().split(/\r?\n/g).forEach(function (line) {
				if (!line) return;
				var match = /^([^\:\s]+)\s*\:\s*(.*)$/.exec(line);
				if (!match) throw new Error('Failed header parse:', JSON.stringify(line));
				var key = match[1].toLowerCase();
				var value = match[2];
				headers[key] = (value.length > 1) ? value : value[0];
			});
			
			var data = request.responseText;
			try {
				data = JSON.parse(data);
			} catch (e) {
				error = error || e;
			}
			callback(error, data, request.status, headers);
		};
		for (var key in params.headers) {
			request.setRequestHeader(key, params.headers[key]);
		}
		request.send();
	});
}