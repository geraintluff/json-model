"use strict";
(function (global, factory) {
	if (typeof define === 'function' && define.amd) {
		// AMD. Register as an anonymous module.
		define(['json-model'], factory);
	} else if (typeof module !== 'undefined' && module.exports){
		// CommonJS. Define export.
		module.exports = factory(require('./model'));
	} else {
		// Browser globals
		global.JsonModel = factory(global.JsonModel);
	}
})(this, function (api) {

	var asap = api.util.timer.asap;
	var resolveUrl = api.util.url.resolve;
	var parseUrl = api.util.url.parse;

	function isAttached(element) {
		var e = element;
		while (e.parentNode) {
			e = e.parentNode;
		}
		return e === element.ownerDocument;
	}
	
	function openTag(tagName, attrs) {
		var html = '<' + tagName;
		for (var key in attrs) {
			var value = attrs[key];
			if (typeof value === 'function') value = value();
			if (api.is(value)) value = value.get();
			if (value === '' || value === true) {
				html += " " + key.escapeHtml();
			} else if (value) {
				html += " " + key.escapeHtml() + '="' + value.toString().escapeHtml() + '"';
			}
		}
		html += '>';
		return html;
	}
	function closeTag(tagName) {
		return '</' + tagName + '>';
	}
	
	var specialAttributes = {
		'class': function (element, value) {
			if (value === null) {
				element.className = '';
				element.removeAttribute('class');
			} else {
				element.setAttribute('class', element.className = value || '');
			}
		}
	};
	function setAttribute(element, key, value) {
		if (specialAttributes[key]) return specialAttributes[key](element, value);
		if (value == null) return element.removeAttribute(key);
		element.setAttribute(key, value);
	};
	
	function scanForChildBindings(element, context, callback) {
		var pending = 1;
		var error = null;
		function donePending(e) {
			error = error || e;
			if (!--pending) callback(e);
		}

		// TODO: better walk, not recursive
		if (element.nodeType === 1) {
			if (element.tagName.toLowerCase() === 'a') {
				if (element.hasAttribute('ajax') || element.hasAttribute('data-ajax')) {
					context.ajaxLink(element);
				}
			}
			
			for (var i = 0; i < element.childNodes.length; i++) {
				var child = element.childNodes[i];
				if (child.nodeType === 1) {
					if (child.hasAttribute(dataPropertyStoreKey)) {
						pending++;
						context._bindKeyPath(child, child.getAttribute(dataPropertyStoreKey), child.getAttribute(dataPropertyPath), child.getAttribute(dataPropertyUiPath), donePending);
					} else {
						pending++;
						context.unbind(child);
						scanForChildBindings(child, context, donePending);
					}
				}
			}
		}
		donePending();
	}
	function executeDiffDom(subject, target, diff, context, callback) {
		if (target.nodeType === 1) {
			// Assign all attributes
			for (var i = 0; i < target.attributes.length; i++) {
				var key = target.attributes[i].name, value = target.attributes[i].value;
				if (subject.getAttribute(key) !== value) {
					setAttribute(subject, key, value);
				}
			}
			var subjectAttributes = [];
			for (var i = 0; i < subject.attributes.length; i++) {
				var key = subject.attributes[i].name;
				subjectAttributes.push(key);
			}
			subjectAttributes.forEach(function (key) {
				if (!target.hasAttribute(key)) {
					setAttribute(subject, key, null);
				}
			});
		}

		var pending = 1;
		var error = null;
		function donePending(e) {
			error = error || e;
			if (!--pending) callback(e);
		}

		var path = diff.path;
		if (!path) {
			subject.nodeValue = target.nodeValue;
			return donePending(null);
		}
		
		var subjectOffset = -1;
		var targetOffset = -1;
		for (var diagonal = 1; diagonal < path.length; diagonal++) {
			var subjectIndex = path[diagonal];
			if (subjectIndex === null) continue;
			var lastSubjectIndex = path[diagonal - 1];
			if (lastSubjectIndex === null) {
				var subjectChild = subject.childNodes[subjectIndex + subjectOffset];
				var targetChild = target.childNodes[diagonal - subjectIndex + targetOffset];
				pending++;
				executeDiffDom(subjectChild, targetChild, diff.actions[diagonal - 1], context, donePending);
			} else if (lastSubjectIndex === subjectIndex) {
				subjectOffset++;
				var subjectChild = subject.childNodes[subjectIndex + subjectOffset];
				var targetChild = target.childNodes[diagonal - subjectIndex + targetOffset];
				target.removeChild(targetChild);
				subject.insertBefore(targetChild, subjectChild);
				targetOffset--;
			} else {
				var subjectChild = subject.childNodes[subjectIndex + subjectOffset];
				subject.removeChild(subjectChild);
				subjectOffset--;
			}
		}
		donePending();
	}
	function diffDom(subject, target, cullSize, ignoreFirstBinding) {
		if (subject.nodeType !== target.nodeType) return;
		if (subject.nodeType !== 1) return {score: 0.5};
		if (subject.tagName !== target.tagName) return;
		if (subject.tagName === 'input' && subject.type !== target.type) return;
		
		if (!ignoreFirstBinding && target.hasAttribute(dataPropertyStoreKey)) {
			if (subject.getAttribute(dataPropertyStoreKey) === target.getAttribute(dataPropertyStoreKey) && subject.getAttribute(dataPropertyPath) === target.getAttribute(dataPropertyPath) && subject.getAttribute(dataPropertyUiPath) === target.getAttribute(dataPropertyUiPath)) {
				return {score: 1};
			} else if (subject.hasAttribute(dataPropertyStoreKey)) {
				return {score: 0.1};
			} else {
				return {score: 0.5};
			}
		}

		// Score based on proportion of correct attributes
		var attributesTotal = 1, attributesCorrect = 1;
		for (var i = 0; i < subject.attributes.length; i++) {
			attributesTotal++;
			var key = subject.attributes[i].name, value = subject.attributes[i].value;
			if (target.getAttribute(i) === value) {
				attributesCorrect++;
			}
		}
		for (var i = 0; i < target.attributes.length; i++) {
			if (!subject.hasAttribute(target.attributes[i].name)) {
				attributesTotal++;
			}
		}
		var score = attributesCorrect/attributesTotal;
		
		var options = [{score: score, path: [0], actions: []}];
		var prevOptions = [];
		
		var subjectCount = subject.childNodes.length;
		var targetCount = target.childNodes.length;
		var diagonal = 1, endDiagonal = subjectCount + targetCount + 1;
		while (diagonal < endDiagonal) {
			var newOptions = [];
			for (var subjectIndex = Math.max(0, diagonal - targetCount); subjectIndex <= subjectCount && subjectIndex <= diagonal; subjectIndex++) {
				var subjectNode = subject.childNodes[subjectIndex - 1];
				var targetNode = target.childNodes[diagonal - subjectIndex - 1];
				var best = {score: -1}, bestScore = -1;
				var addFrom = options[subjectIndex];
				if (addFrom) {
					var score = 0;
					if (score > bestScore) {
						best = {score: addFrom.score + score, path: addFrom.path.concat([subjectIndex]), actions: addFrom.actions.concat(['add ' + targetNode])};
					}
				}
				var removeFrom = options[subjectIndex - 1];
				if (removeFrom) {
					var score = 0;
					if (score > bestScore) {
						best = {score: removeFrom.score + score, path: removeFrom.path.concat([subjectIndex]), actions: removeFrom.actions.concat(['remove' + subjectNode])};
					}
				}
				var mergeFrom = prevOptions[subjectIndex - 1];
				if (mergeFrom) {
					var diff = diffDom(subjectNode, targetNode, cullSize) || {score: -Infinity};
					if (diff.score > bestScore) {
						best = {score: mergeFrom.score + diff.score, path: mergeFrom.path.concat([null, subjectIndex]), actions: mergeFrom.actions.concat(['merge ' + subjectNode + ' -> ' + targetNode, diff])};
					}
				}
				newOptions[subjectIndex] = best;
			}
			prevOptions = options;
			options = newOptions.slice(0);
			newOptions.sort(function (a, b) {
				return b.score - a.score;
			});
			options = options.map(function (option) {
				if (newOptions.indexOf(option) < cullSize) return option;
				return null;
			});
			diagonal++;
		}
		var result = options[subjectCount];
		return result;
	}
	
	function Binding(bindObj, registerIndex) {
		if (!(this instanceof Binding)) return new Binding(bindObj, registerIndex);
		var thisBinding = this;
		this.registerIndex = registerIndex;

		if (typeof bindObj.canBind === 'string' || Array.isArray(bindObj.canBind)) {
			bindObj.canBind = {schema: bindObj.canBind};
		}
		if (typeof bindObj.canBind === 'object') {
			var bindConditions = bindObj.canBind;
			if (bindConditions.schema && !Array.isArray(bindConditions.schema)) {
				bindConditions.schema = [bindConditions.schema];
			}
			if (bindConditions.type && !Array.isArray(bindConditions.type)) {
				bindConditions.type = [bindConditions.type];
			}
			if (bindConditions.tag && !Array.isArray(bindConditions.tag)) {
				bindConditions.tag = [bindConditions.tag];
			}
			this.canBind = function (model, tag, attrs) {
				if (bindConditions.tag && bindConditions.tag.indexOf(tag) === -1) {
					return false;
				}
				if (bindConditions.type) {
					var modelType = model.jsonType();
					if (bindConditions.type.indexOf(modelType) === -1) {
						return false;
					}
				}
				if (bindConditions.schema) {
					var modelSchemas = model.schemas();
					var baseUrl = model._root.dataStore.baseUrl;
					if (!bindConditions.schema.some(function (schema) {
						schema = resolveUrl(baseUrl, schema);
						return modelSchemas.indexOf(schema) !== -1;
					})) {
						return false;
					}
				}
				if (bindConditions.filter) {
					if (!bindConditions.filter(model, tag, attrs)) return false;
				}
				return true;
			};
			this.priority = bindObj.priority || 0;
			this.priority += (!!bindConditions.tag)*10 + (!!bindConditions.schema)*5 + (!!bindConditions.type)*2;
		} else {
			this.canBind = bindObj.canBind;
			this.priority = bindObj.priority || 0;
		}

		if (typeof bindObj.html === 'function') {
			this.html = bindObj.html.bind(bindObj);
		} else if (typeof bindObj.html === 'string') {
			this.html = function () {return bindObj.html;};
		}
		
		var modelEvents = bindObj.modelEvents || {};
		modelEvents.change = modelEvents.change || function (model, element, ui, pointerPath) {
			return !pointerPath;
		};
		var uiEvents = bindObj.uiEvents || {};
		/*
		uiEvents.change = uiEvents.change || function (model, element, ui, pointerPath) {
			return pointerPath.split('/').length <= 2 && ui.jsonType(pointerPath) !== 'object';
		};
		*/
		
		this.bindDom = function (context, model, element) {
			// TODO: polling is *nasty*
			var checkUnattached = function () {
				if (!isAttached(element)) {
					console.log('Detached from document: ', element);
					context.unbind(element);
					clearInterval(checkInterval);
					return true;
				}
			};
			var checkInterval = setInterval(checkUnattached, 1000);

			var modelHandlers = context.boundJsonModelEvents = {};
			Object.keys(modelEvents).forEach(function (key) {
				var original = modelEvents[key];
				var handler = modelHandlers[key] = function () {
					if (element.boundContext !== context) {
						return thisBinding.unbindDom(context, model, element);
					}
					
					var args = Array.prototype.slice.call(arguments, 0);
					args = [model, element, context].concat(args);
					var shouldRender = original.apply(this, args);
					if (shouldRender) {
						context.bind(model, element);
					}
				};
				model.on(key, handler);
			});
			var uiHandlers = context.boundUiEvents = {};
			Object.keys(uiEvents).forEach(function (key) {
				var original = uiEvents[key];
				var handler = uiHandlers[key] = function () {
					if (element.boundContext !== context) {
						return thisBinding.unbindDom(context, model, element);
					}
					
					var args = Array.prototype.slice.call(arguments, 0);
					args = [model, element, context].concat(args);
					var shouldRender = original.apply(this, args);
					if (shouldRender) {
						context.bind(model, element);
					}
				};
				context.ui.on(key, handler);
			});
			
			model.emit('bind', element);
			if (uiHandlers.bind) uiHandlers.bind.call(null);
		};
		this.unbindDom = function (context, model, element) {
			model.emit('unbind', element);
			if (context.boundUiEvents.unbind) context.boundUiEvents.unbind.call(null);

			for (var key in context.boundJsonModelEvents) {
				var handler = context.boundJsonModelEvents[key];
				model.off(key, handler);
			}
			for (var key in context.boundUiEvents) {
				var handler = context.boundUiEvents[key];
				context.ui.off(key, handler);
			}
		};
	}
	Binding.prototype = {
	};
	
	function Bindings(parent) {
		this._state = 0; // Increment every time something happens, so children know to re-concatenate
		this._immediateOptions = [];
		this._concatOptions = [];
		this._needSort = false;
		
		this.parent = parent || {
			_state: 0,
			_options: function () {return this;}.bind([])
		};
		this._parentState = parent ? parent.options().length : 0;
	}
	Bindings.prototype = {
		_options: function () {
			if (this.parent._state !== this._parentState) {
				this._concatOptions = this._immediateOptions.concat(this.parent._options());
				this._needSort = true;
				this._parentState = this.parent._state;
			}
			if (this._needSort) {
				this._needSort = false;
				this._concatOptions.sort(function (a, b) {
					return (b.priority - a.priority) || (b.registerIndex - a.registerIndex);
				});
			}
			return this._concatOptions;
		},
		addHtml: function (canBind, htmlFunc) {
			return this.add({
				canBind: canBind,
				html: htmlFunc
			});
		},
		add: function (bindObj) {
			this._state++;
			this._immediateOptions.push(new Binding(bindObj, this._state));
			this._parentState = null; // Trigger re-concatenate on next options() call
			return this;
		},
		select: function (model, tagName, attrs, bannedBindings) {
			var options = this._options();
			var schemas = model.schemas();
			for (var i = 0; i < options.length ; i++) {
				var binding = options[i];
				if (binding.canBind(model, tagName, attrs) && bannedBindings.indexOf(binding) === -1) {
					return binding;
				}
			}
		}
	};
	if (typeof require === 'function' && typeof module !== 'undefined') {
		Bindings.prototype.include = function (json) {
			var path = require('path');
			if (typeof json === 'string') {
				try {
					json = require(path.resolve(json));
				} catch (e) {
					json = require(json);
				}
			}
			var thisBindings = this;
			(json.js || []).forEach(function (jsPath) {
				this.includeJs(jsPath);
			});
			(json.css || []).forEach(function (cssPath) {
				this.includeCss(cssPath);
			});
		};
		Bindings.prototype.includeDir = function (dirname) {
			var path = require('path'), fs = require('fs');
			var thisBindings = this;
			var items = require('fs').readdirSync(dirname);
			items.sort();
			items.forEach(function (filename) {
				if (/\.js$/i.test(filename)) {
					thisBindings.includeJs(dirname + '/' + filename);
				} else if (/\.css$/i.test(filename)) {
					thisBindings.includeCss(dirname + '/' + filename);
				}
			});
		};
		Bindings.prototype.includeCss = function (filename) {
			var code = require('fs').readFileSync(filename, {encoding: 'utf-8'});
			code = '/*** ' + require('path').basename(filename) + ' ***/\n\n' + code;
			this._includeCss = ((this._includeCss || '') + '\n\n' + code).replace(/^(\r?\n)*/g, '').replace(/(\r?\n)*$/g, '');
		};
		Bindings.prototype.includeJs = function (filename) {
			var path = require('path');
			if (filename.charAt(0) === '.') {
				filename = path.join(process.cwd(), filename);
			}
			var after = [];
			['bindings', 'JsonModel'].forEach(function (key) {
				if (key in global) {
					var oldValue = global[key];
					after.push(function () {global[key] = oldValue;});
				} else {
					after.push(function () {delete global[key];});
				}
			});
			global.bindings = this;
			global.JsonModel = api;
			
			require(path.resolve(filename));
			var code = require('fs').readFileSync(filename, {encoding: 'utf-8'});
			code = '/*** ' + path.basename(filename) + ' ***/\n\n' + code;
			this._includeJs = ((this._includeJs || '') + '\n\n' + code).replace(/^(\r?\n)*/g, '').replace(/(\r?\n)*$/g, '');
			
			while (after.length) after.pop()();
		};
		Bindings.prototype.bundleJs = function (skip) {
			var header = skip ? '' : '(function (JsonModel, bindings) {\n\n';
			var footer = skip ? '' : '\n\n})(JsonModel, JsonModel.bindings);';
			var includeCode = this._includeJs || '';
			if (typeof this.parent.bundleJs === 'function') {
				includeCode = this.parent.bundleJs(true) + (includeCode ? '\n\n' : '') + includeCode;
			}
			return header + includeCode + footer;
		};
		api.bundleJs = function (bindings, includeCss) {
			if (typeof bindings === 'boolean') {
				includeCss = bindings;
				bindings = null;
			}
			bindings = bindings || api.bindings;
			var code = ['/schema2js.js', '/model.js', '/model-bind.js'].map(function (filename) {
				var result = '/*** ' + filename + ' ***/\n\n';
				result += require('fs').readFileSync(__dirname + filename, {encoding: 'utf-8'});
				return result;
			});
			code.push(bindings.bundleJs());
			if (includeCss) {
				var cssFunc = '/*** CSS ***/\n\n(function (css) {\n\tvar style = document.createElement("style");\n\tstyle.appendChild(document.createTextNode(css));\n\tdocument.head.appendChild(style);\n})';
				code.push(cssFunc + '(' + JSON.stringify(this.bundleCss()) + ')');
			}
			return code.join('\n\n');
		};
		Bindings.prototype.bundleCss = function (skip) {
			var includeCode = this._includeCss || '';
			if (typeof this.parent.bundleCss === 'function') {
				includeCode = this.parent.bundleCss(true) + (includeCode ? '\n\n' : '') + includeCode;
			}
			return includeCode;
		};
		api.bundleCss = function (bindings) {
			bindings = bindings || api.bindings;
			return bindings.bundleCss();
		};
	}
	api.bindings = new Bindings();
	
	api.navigateTo = function (href) {
		href = resolveUrl(window.location.href, href);
		var loc = window.location.href;
		if (href === loc) return;
		var locParsed = parseUrl(loc);
		var domain = locParsed.protocol + locParsed.authority;
		var path = window.location.href.replace(/[#?].*/g, '');
		if (href.substring(0, path.length) === path) {
			href = href.substring(path.length);
		} else if (href.substring(0, domain.length) === domain) {
			href = href.substring(domain.length);
		} else {
			window.location.href = href;
			return;
		}
		if (typeof history === 'object' && typeof history.pushState === 'function') {
			history.pushState(null, null, href);
		} else {
			window.location.href = '#' + encodeURI(href).replace(/#/g, '%23');
		}
	};
	
	// Something nobody would actually output, and would be HTML-escaped if it were in content anyway
	//    TODO: XSS?  E.g. code not removed by HTML sanitiser, causes rendering of external resource when only safe local content expected, renderer dumps raw HTML to page
	//    Could introduce secret/random component to fight this
	var magicPlaceholders = ['\u003cJM--', '-->']; // \u003c == '<', but it means we don't match ourselves accidentally
	var magicRegex = /\u003cJM--(.*?)-->/g;
	var dataPropertyStoreKey = 'data-JMstoreKey';
	var dataPropertyPath = 'data-JMpath';
	var dataPropertyUiPath = 'data-JMuipath';
	var dataPropertyState = 'data-JMrevision';
	function BindingContext(bindings, dataStore, initialUi) {
		this._bindings = bindings;
		this._dataStore = dataStore;
		// Sub-binding stuff
		this._root = this;
		this._model = null;
		this._usedBindings = [];
		this.ui = this._dataStore.create(initialUi || {});
		this.includeDataProperties = false;
		
		this.urlForState = function (resourceUrl, newUiState) {
			return '?json=' + encodeURIComponent(resourceUrl);
		};
		this.stateForUrl = function (url) {
			var parsed = api.util.url.parse(url);
			var query = api.util.url.parseQuery(parsed.search);
			return [query.json, {}];
		};
	}
	BindingContext.prototype = {
		_subContext: function (model, binding, uiPath, includeDataProperties) {
			var result = Object.create(this._root);
			result._model = model;
			result._usedBindings = [binding];
			if (this._model === model) {
				result._usedBindings = this._usedBindings.concat(result._usedBindings);
			}
			uiPath = (uiPath || '') + '';
			result.ui = this.ui.path(uiPath);
			if (result.ui.jsonType() !== 'object') {
				result.ui.set('', {});
			}
			result.includeDataProperties = includeDataProperties || this.includeDataProperties;
			return result;
		},
		monitorLocation: function (element) {
			var thisContext = this;
			
			var getHref = function () {
				return window.location.href;
			};
			
			var oldHref = null;
			var updateFromLocation = function () {
				var href = getHref();
				if (href === oldHref) return;
				oldHref = href;
				var fragment = href.replace(/^[^#]*/, '').substring(1);
				fragment = decodeURIComponent(fragment);
				var newHref = resolveUrl(href.replace(/#.*/, ''), fragment)
				console.log('New URL:', newHref);
				
				var state = thisContext.stateForUrl(newHref);
				var resourceUrl = state[0], uiState = state[1];
				console.log('New state:', resourceUrl, uiState);
				if (resourceUrl) {
					// Reset the UI state, don't bother trying to change it
					thisContext.ui = thisContext._dataStore.create(state[1] || {});
					thisContext.bind(state[0], element);
				} else {
					// Update the UI state, leaving the URL the same
					thisContext.ui.set('', uiState);
				}
			}

			if (typeof history === 'object' && typeof history.pushState === 'function') {
				window.onpopstate = updateFromLocation;
			}
			
			var interval = setInterval(updateFromLocation, 100);
			return function () {
				clearInterval(interval);
			};
		},
		navigateTo: function (href) {
			api.navigateTo(href);
		},
		ajaxLink: function (a) {
			var thisContext = this;
			a.onclick = a.onclick || function (event) {
				var href = a.getAttribute('href');
				if (typeof href === 'string') {
					thisContext.navigateTo(href);
					event.preventDefault();
					return false;
				}
			}
		},
		selectBinding: function (model, tag, attrs) {
			if (model === this._model) {
				return this._bindings.select(model, tag, attrs, this._usedBindings);
			} else {
				return this._bindings.select(model, tag, attrs, []);
			}
		},
		errorHtml: function (error, tag, attrs) {
			return '<span class="error">Error: ' + error.message.escapeHtml() + '</span>';
		},
		_renderInnerHtml: function (model, binding, tag, attrs, callback) {
			var context = this;
			var immediateHtml = binding.html(model, tag, attrs, this, function (error, html) {
				if (error) return callback(error, html);
				if (typeof immediateHtml === 'string') {
					throw new Error('Renderer must either return HTML string or call the callback, but not both');
				}
				context.expandHtml(html, callback);
			});
			if (typeof immediateHtml === 'string') {
				context.expandHtml(immediateHtml, callback);
			}
		},
		_renderHtml: function (model, tag, attrs, uiPath, callback) {
			var thisContext = this;
			tag = tag || 'span';
			attrs = attrs || {};

			var result = function () {
				var binding = thisContext.selectBinding(model, tag, attrs);
				var context = thisContext._subContext(model, binding, uiPath);
				context._renderInnerHtml(model, binding, tag, attrs, function (error, html) {
					if (typeof html === 'string') {
						html = openTag(tag, attrs) + html + closeTag(tag);
					}
					callback(error, html);
				});
			};
			if (model.ready()) {
				result();
			} else {
				model.whenReady(result);
			}
		},
		expandHtml: function (html, callback) {
			var thisContext = this;
			html.asyncReplace(magicRegex, function (match, data, callback) {
				try {
					data = JSON.parse(data);
				} catch (e) {
					console.log(data, html);
					return callback(e);
				}
				data.tag = data.tag || 'span';
				data.attrs = data.attrs || {};
				data.ui = data.ui || '';
				var rootModel = thisContext._dataStore._getRootModel(data.key);
				if (!rootModel) {
					var error = new Error('Missing from data store: ' + data.key);
					var errorHtml = thisContext.errorHtml(error, data.tag, data.attrs)
					return callback(error, openTag(data.tag, data.attrs) + errorHtml + closeTag(data.tag, data.attrs));
				}
				var model = rootModel.modelForPath(data.path);
				if (thisContext.includeDataProperties) {
					data.attrs[dataPropertyStoreKey] = data.key;
					data.attrs[dataPropertyPath] = data.path;
					data.attrs[dataPropertyUiPath] = data.ui;
					data.attrs[dataPropertyState] = rootModel.state;
				}
				thisContext._renderHtml(model, data.tag, data.attrs, data.ui, callback);
			}, callback);
		},
		_updateDom: function (element, tag, attrs, callback) {
			if (element.pendingDomUpdate) return callback(null);
			var thisContext = this;
			var model = element.boundJsonModel;
			var binding = element.boundBinding;
			var context = element.boundContext;

			element.pendingDomUpdate = true;
			var oldRootState = model._root.state;
			var innerHtml = binding.html(model, tag, attrs, this, processHtml);
			if (typeof innerHtml === 'string') {
				processHtml(null, innerHtml);
			}

			function processHtml(error, innerHtml) {
				var replacedHtml = innerHtml.replace(magicRegex, function (match, data) {
					try {
						data = JSON.parse(data);
					} catch (e) {
						error = error || e;
						return context.errorHtml(e);
					}
					data.tag = data.tag || 'span';
					data.attrs = data.attrs || {};
					data.attrs[dataPropertyStoreKey] = data.key;
					data.attrs[dataPropertyPath] = data.path;
					data.attrs[dataPropertyUiPath] = data.ui;
					return openTag(data.tag, data.attrs) + closeTag(data.tag);
				});
				// DEBUG
				if (tag !== 'html' && tag !== 'body') {
					replacedHtml = '<span class="debug">' + context._usedBindings.length + ' bindings used ' + context.ui._path + '</span>' + replacedHtml;
				}
				
				var hostElement = element.cloneNode(false);
				hostElement.innerHTML = replacedHtml;
				context._coerceDom(element, hostElement, null, function (err) {
					element.pendingDomUpdate = false;
					if (oldRootState !== model._root.state) {
						console.log('Model changed during rendering: ' + model.url());
						var newHtml = binding.html(model, tag, attrs, thisContext, function (err2, newHtml) {
							if (newHtml === innerHtml) {
								return callback(error || err);
							}
							console.log('Re-rendering');
							return thisContext._updateDom(element, tag, attrs, callback);
						});
						if (typeof newHtml === 'string') {
							if (newHtml === innerHtml) {
								return callback(error || err);
							}
							console.log('Re-rendering');
							return thisContext._updateDom(element, tag, attrs, callback);
						}
						return;
					}
					callback(error || err);
				});
			}
		},
		_renderDom: function (model, element, uiPath, callback) {
			var thisContext = this;
			
			if (!isAttached(element)) {
				console.log('Not attached to document:', element);
				asap(function () {
					callback(new Error('Not attached to document'));
				})
			}
			
			var tag = element.tagName.toLowerCase();
			var attrs = {};
			for (var i = 0; i < element.attributes.length; i++) {
				var attribute = element.attributes[i];
				attrs[attribute.name] = attribute.value;
			}
			
			model.whenReady(function () {
				var oldState = model._root.state;

				var binding = thisContext.selectBinding(model, tag, attrs);
				var context = thisContext._subContext(model, binding, uiPath, true);

				if (element.boundJsonModel) {
					if (model === element.boundJsonModel) {
						return thisContext._updateDom(element, tag, attrs, callback);
					} else {
						thisContext.unbind(element);
					}
				}
				element.boundJsonModel = model;
				element.boundBinding = binding;
				element.boundContext = context;
				
				function htmlReady(error) {
					scanForChildBindings(element, context, function (err) {
						binding.bindDom(context, model, element);
						if (oldState !== model._root.state) {
							console.log('Model changed during initial render:', model.url());
							return thisContext._updateDom(element, tag, attrs, callback);
						}
						callback(error || err);
					});
				}

				if (element.hasAttribute(dataPropertyStoreKey)) {
					var rootModel = thisContext._dataStore._getRootModel(element.getAttribute(dataPropertyStoreKey));
					if (rootModel) {
						var existingModel = rootModel.modelForPath(element.getAttribute(dataPropertyPath));
						if (model === existingModel) {
							var stateString = rootModel.state + "";
							if (stateString === element.getAttribute(dataPropertyState)) {
								// Rendering is up-to-date, so we don't need to do DOM coercion
								return htmlReady(null);
							}
						}
					}
				}
				
				context._renderInnerHtml(model, binding, tag, attrs, function (error, innerHtml) {
					// DEBUG
					innerHtml = '<span class="debug">DOM/HTML render</span>' + innerHtml;
					element.innerHTML = innerHtml;
					htmlReady(error);
				});
			});
		},
		_coerceDom: function coerceDom(subject, target, cullSize, callback) {
			var thisContext = this;
			cullSize = cullSize || 3;
			var diff = diffDom(subject, target, cullSize, true);
			executeDiffDom(subject, target, diff, this, function (error) {
				scanForChildBindings(subject, thisContext, function (err) {
					callback(error || err);
				});
			});
		},
		_bindKeyPath: function (element, storeKey, path, uiPath, callback) {
			var rootModel = this._dataStore._getRootModel(storeKey);
			if (!rootModel) {
				return callback(new Error('Model missing during bind sweep: ' + storeKey));
			}
			var model = rootModel.modelForPath(path);
			this.bind(model, element, uiPath, callback);
		},
		bind: function (model, element, uiPath, callback) {
			if (typeof uiPath === 'function') {
				callback = uiPath;
				uiPath = null;
			}
			uiPath = uiPath || null;
			var thisContext = this;
			if (!api.is(model)) {
				model = this._dataStore.open(model);
			}
			if (typeof element === 'string') {
				element = document.getElementById(element);
			}
			
			callback = callback || function () {};
			this._renderDom(model, element, uiPath, callback);
		},
		unbind: function (element) {
			if (element.boundJsonModel) {
				element.boundBinding.unbindDom(element.boundContext, element.boundJsonModel, element);

				delete element.boundJsonModel;
				delete element.boundBinding;
				delete element.boundContext;
			}
		}
	};
	BindingContext.placeholder = function (model, tag, attrs, uiPath) {
		model._root.pokeStore();
		return magicPlaceholders.join(JSON.stringify({
			key: model._root.storeKey,
			path: model._path,
			tag: tag,
			attrs: attrs,
			ui: uiPath
		}));
	};
	api.context = new BindingContext(api.bindings, api.dataStore);
	
	String.prototype.escapeHtml = function () {
		return this.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	};
	String.prototype.asyncReplace = function (subStr, replacer, callback) {
		var str = this;
		var error = null;
		var replacements = {};
		var pending = 1;
		var checkDone = function () {
			if (!--pending) {
				var result = str.replace(subStr, function (match) {
					var pos = arguments[arguments.length - 2];
					var key = pos + '-' + match.length;
					return replacements[key];
				});
				callback(error, result);
			}
		};
		str.replace(subStr, function (match) {
			pending++;
			var pos = arguments[arguments.length - 2];
			var key = pos + '-' + match.length;
			var args = Array.prototype.slice.call(arguments, 0, replacer.length - 1);
			args.push(function (err, result) {
				if (err) {
					error = error || err;
					replacements[key] = result || '';
					replacer = function (callback) {
						callback(null, '');
					};
					return checkDone();
				}
				replacements[key] = result;
				checkDone();
			});
			replacer.apply(null, args);
		});
		asap(checkDone);
		return this;
	};

	api.extend({
		getHtml: function (pathSpec) {
			var value = this.get(pathSpec);
			if (value == null) value = '';
			if (typeof value.toJSON === 'function') {
				value = value.toJSON();
			}
			if (typeof value === 'object') {
				value = JSON.stringify(value);
			}
			return (value + "").escapeHtml();
		},
		getHtmlCss: function (pathSpec) {
			var value = this.get(pathSpec);
			if (value == null) value = '';
			return (value + "").escapeHtml().replace(/;/g, ',');
		},
		html: function (tag, attrs, uiPath) {
			return BindingContext.placeholder(this, tag, attrs, uiPath);
		}
	});
	
	// Default bindings
	api.bindings.add({
		priority: -Infinity,
		canBind: function (model, tagName, attrs) {
			if (!('value' in attrs)) return true;
		},
		html: function (model) {
			return model.getHtml();
		}
	});
	
	api.bindings.add({
		canBind: function (model, tagName, attrs) {
			if (tagName === 'textarea' || (tagName === 'input' && attrs.type === 'text')) {
				return true;
			}
		},
		/*
		bind: function (model, input) {
			function updateModel() {
				model.set(input.value);
			}
			function updateInput() {
				var value = model.get();
				if (value == null) value = "";
				if (value !== input.value) {
					input.value = value;
				}
			}
			
			model.on('change', updateInput);
			input.addEventListener('change', updateModel);
			var pollTimer = null;
			input.addEventListener('focus', function () {
				pollTimer = setInterval(updateModel, 15);
			});
			input.addEventListener('blur', function () {
				clearInterval(pollTimer);
			});

			updateInput();
		}
		*/
	});
	
	return api;
});