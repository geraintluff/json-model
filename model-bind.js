(function (global, factory) {
	if (typeof define === 'function' && define.amd) {
		// AMD. Register as an anonymous module.
		define(['json-model'], factory);
	} else if (typeof module !== 'undefined' && module.exports){
		// CommonJS. Define export.
		module.exports = factory(require('./model'), require('xmldom'));
	} else {
		// Browser globals
		global.JsonModel = factory(global.JsonModel);
	}
})(this, function (api, DOMParser) {
	// Hackity-hack!
	DOMParser = DOMParser || {
		parse: function (html) {
			var container = document.createElement('div');
			container.innerHTML = html;
			container.document.Element = container.childNodes[0];
			return container;
		}
	};
	
	function openTag(tagName, attrs) {
		var html = '<' + tagName;
		for (var key in this.attrs) {
			value = this.getAttr(key);
			if (value) {
				html += " " + key.escapeHtml() + '="' + value.toString().escapeHtml() + '"';
			}
		}
		html += '>';
		return html;
	}
	
	function closeTag(tagName) {
		return '</' + tagName + '>';
	}

	function Dom(tag, attrs, children) {
		if (!(this instanceof Dom)) return new Dom(tag, attrs, children);
		this.tag = tag;
		this.attrs = attrs || {};
		this.children = children || [];
		if (!Array.isArray(this.children)) this.children = [this.children];
		this.boundModel = null;
	}
	Dom.fromHtml = function (html, model) {
		var parser = new DOMParser();
		var doc = parser.parse(html, 'text/html');
		var result = Dom.fromElement(container, model);
		result.tag = null;
		return result;
	};
	Dom.fromElement = function (element, model) {
		var tag = element.tagName.toLowerCase();
		var attrs = {};
		var bindModel = null;
		for (var i = 0; i < element.attributes.length; i++) {
			var attribute = element.attributes[i];
			var key = attribute.name, value = attribute.value;
			if (key === 'data-path') {
				bindModel = model.path(value);
				continue;
			}
			attrs[key] = value;
		}
		var dom = new Dom(tag, attrs);
		if (bindModel) {
			dom.bind(bindModel);
			return dom;
		}
		for (var i = 0; i < element.childNodes.length; i++) {
			var child = element.childNodes[i];
			if (child.nodeType === 3) {
				dom.children.push(child.nodeValue);
			} else if (child.nodeType === 1) {
				dom.children.push(Dom.fromElement(child, model));
			}
		}
		return dom;
	};
	var specialAttributes = {
		'class': function (element, value) {
			element.setAttribute('class', element.className = value || '');
		}
	}
	Dom.setAttribute = function (element, key, value) {
		if (specialAttributes[key]) return specialAttributes[key](element, value);
		if (value == null) return element.removeAttribute(key);
		element.setAttribute(key, value);
	};
	Dom.prototype = {
		child: function (tag, attrs, content) {
			var child = new Dom(tag, attrs, content);
			this.children.push(child);
			return child;
		},
		getAttr: function (key) {
			var value = this.attrs[key];
			if (typeof value === 'function') value = value();
			if (api.is(value)) {
				value = value.get();
			}
			return value;
		},
		getChildHtml: function (index) {
			var value = this.children[index];
			if (typeof value === 'function') value = value();
			if (value instanceof Dom) {
				return value.html();
			}
			if (api.is(value)) return value.html();
			return (value + "").escapeHtml();
		},
		innerHtml: function () {
			var html = '';
			for (var i = 0; i < this.children.length; i++) {
				html += this.getChildHtml(i);
			}
			return html;
		},
		html: function (defaultTag) {
			var tag = this.tag || defaultTag || 'span';
			var html = openTag(tag, this.attrs);
			html += this.innerHtml();
			html += closeTag(tag);
			return html;
		},
		matchChild: function (index, element) {
			var value = this.children[index];
			if (typeof value === 'function') value = value();
			if (value instanceof Dom) {
				return value.match(element);
			}
			if (element.nodeType === 3) {
				// All text fields match text values
				return {score: 1, match: 'text'};
			}
			return {score: -1, match:[undefined]};
		},
		match: function (element) {
			if (!element.tagName || (this.tag && this.tag.toLowerCase() !== element.tagName.toLowerCase())) {
				return {score: 0};
			}
			var attrCount = Object.keys(this.attrs).length, attrsMatched = 0;
			for (var key in this.attrs) {
				var value = this.getAttr(key);
				if (value === false || value == null) {
					if (!element.hasAttribute(key)) {
						attrsMatched++;
					}
				} else {
					var elementValue = element.getAttribute(key);
					if (elementValue === value.toString()) {
						attrsMatched++;
					}
				}
			}
			var attrMatch = (attrsMatched + 1)/(attrCount + 1);
			// Viterbi path through merge
			var options = {}, mergeThreshhold = 0.3;
			options['0-0'] = {score: attrMatch, match:[]};
			var modelChildCount = this.children.length, elementChildCount = element.childNodes.length;;
			var diagonalMax = modelChildCount + elementChildCount;
			for (var diagonal = 1; diagonal <= diagonalMax; diagonal++) {
				for (var childPos = 0; childPos <= elementChildCount && childPos <= diagonal; childPos++) {
					if (diagonal - childPos > modelChildCount) continue;
					var key = diagonal + '-' + childPos;
					var keyModelAdd = (diagonal - 1) + '-' + childPos;
					var keyElementRemove = (diagonal - 1) + '-' + (childPos - 1);
					var keyMatch = (diagonal - 2) + '-' + (childPos - 1);

					var bestOption = null, bestScore = -diagonalMax;
					if (options[keyModelAdd]) {
						if (options[keyModelAdd].score > bestScore) {
							bestOption = {
								score: options[keyModelAdd].score,
								match: options[keyModelAdd].match.concat([{
									action: 'add',
									model: diagonal - childPos - 1,
									element: childPos - 1
								}])
							};
							bestScore = bestOption.score;
						}
					}
					if (options[keyElementRemove]) {
						if (options[keyElementRemove].score > bestScore) {
							bestOption = {
								score: options[keyElementRemove].score,
								match: options[keyElementRemove].match.concat([{
									action: 'remove',
									element: childPos - 1
								}])
							};
							bestScore = bestOption.score;
						}
					}
					if (options[keyMatch]) {
						var subMatch = this.matchChild(diagonal - childPos - 1, element.childNodes[childPos - 1]);
						var possibleScore = options[keyMatch].score + subMatch.score - mergeThreshhold;
						if (possibleScore > bestScore) {
							bestOption = {
								score: possibleScore,
								match: options[keyMatch].match.concat([{
									action: 'merge',
									model: diagonal - childPos - 1,
									element: childPos - 1,
									match: subMatch.match
								}])
							};
							bestScore = possibleScore;
						}
					}
					if (bestOption) {
						options[key] = bestOption;
					}
				}
			}
			var finalKey = diagonalMax + '-' + elementChildCount;
			var finalOption = options[finalKey];
			var maxPossibleScore = 1 + Math.min(modelChildCount, elementChildCount)*(1 - mergeThreshhold);
			return {
				score: finalOption.score/maxPossibleScore,
				match: finalOption.match
			};
		},
		coerce: function (element, dataModel, merge) {
			if (!merge) {
				var match = this.match(element);
				if (!match.score) throw new Error('Cannot coerce un-matching element');
				merge = match.match;
			}
			// Coerce keys
			for (var key in this.attrs) {
				var value = this.getAttr(key);
				if (value === false || value == null) {
					element.removeAttribute(key);
				} else {
					value = value.toString();
					var elementValue = element.getAttribute(key);
					if (elementValue !== value) {
						Dom.setAttribute(element, key, value);
					}
				}
			}
			var childOffset = 0;
			for (var i = 0; i < merge.length; i++) {
				var step = merge[i];
				if (step.action === 'remove') {
					var child = element.childNodes[childOffset + step.element];
					element.removeChild(child);
					childOffset--;
				} else if (step.action === 'add') {
					var container = document.createElement('div');
					container.innerHTML = this.getChildHtml(step.model);
					var contents = container.childNodes[Math.floor(container.childNodes.length/2)];
					contents = contents || document.createTextNode('');
					element.insertBefore(contents, element.childNodes[childOffset + step.element + 1]);
					childOffset++;
					if (this.children[step.model] instanceof Dom) this.children[step.model].bindToElement(contents, dataModel);
				} else if (step.match === 'text') {
					var html = this.getChildHtml(step.model);
					var child = element.childNodes[step.element];
					if ('innerHTML' in child) {
						child.innerHTML = html;
					} else {
						var container = document.createElement('div');
						container.innerHTML = html;
						var contents = container.childNodes[Math.floor(container.childNodes.length/2)];
						contents = contents || document.createTextNode('');
						child.nodeValue = contents.nodeValue;
					}
				} else {
					var child = this.children[step.model];
					child.coerce(element.childNodes[childOffset + step.element], dataModel, step.match);
				}
			}
			this.bindToElement(element, dataModel);
		},
		bindToElement: function (element, model) {
			var bindingModel = this.boundModel;
			if (typeof bindingModel === 'string' || typeof bindingModel === 'number') {
				bindingModel = model.path(bindingModel);
			}
			if (bindingModel && element.boundDataModel !== bindingModel) {
				if (element.boundDataModel) {
					element.boundapi.unbindFrom(element);
				}
				bindingModel.bindTo(element);
			}
		},
		bind: function (model) {
			this.boundModel = model;
		}
	};
	api.Dom = Dom;
	
	function Binding(bindObj, registerIndex) {
		if (!(this instanceof Binding)) return new Binding(bindObj, registerIndex);
		this.registerIndex = registerIndex;

		if (typeof bindObj.canBind === 'string') {
			bindObj.canBind = {schema: bindObj.canBind};
		}
		if (typeof bindObj.canBind === 'object') {
			var bindConditions = bindObj.canBind;
			if (bindConditions.schema && !Array.isArray(bindConditions.schema)) {
				bindConditions.schema = [bindConditions.schema];
			}
			if (bindConditions.tag && !Array.isArray(bindConditions.tag)) {
				bindConditions.tag = [bindConditions.tag];
			}
			this.canBind = function (model, tag, attrs) {
				if (bindConditions.tag && bindConditions.tag.indexOf(tag) === -1) {
					return false;
				}
				if (bindConditions.schema) {
					var modelSchemas = model.schemas();
					if (!bindConditions.schema.some(function (schema) {
						return modelSchemas.indexOf(schema) !== -1;
					})) {
						return false;
					}
				}
				return true;
			};
			this.priority = bindObj.priority || 0;
			this.priority += (!!bindConditions.tag)*10 + (!!bindConditions.schema)*5;
		} else {
			this.canBind = bindObj.canBind;
			this.priority = bindObj.priority || 0;
		}

		if (typeof bindObj.html === 'function') {
			this.html = bindObj.html.bind(bindObj);
			this.dom = function (model, tagName, attrs) {
				return Dom.fromHtml(bindObj.html(model, tagName, attrs), model);
			}
		} else if (typeof bindObj.html === 'string') {
			this.html = function () {return bindObj.html;};
			var dom = Dom.fromHtml(bindObj.html);
			this.dom = function () {return dom;};
		} else if (bindObj.dom instanceof Dom) {
			this.dom = function () {return bindObj.dom;};
		} else {
			this.dom = bindObj.dom;
		}
		this.bind = bindObj.bind;
		this.shouldUpdate = bindObj.shouldUpdate || function (pointerPath, model) {
			return !pointerPath;
		};
	}
	Binding.prototype = {
		html: function (model, tagName, attrs) {
			var dom = this.dom(model, tagName, attrs);
			return dom.innerHtml();
		}
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
		add: function (bindObj) {
			this._state++;
			this._immediateOptions.push(new Binding(bindObj));
			this._parentState = null; // Trigger re-concatenate on next options() call
			return this;
		},
		select: function (model, tagName, attrs) {
			var options = this._options();
			var schemas = model.schemas();
			for (var i = 0; i < options.length ; i++) {
				var binding = options[i];
				if (binding.canBind(model, tagName, attrs)) {
					return binding;
				}
			}
		}
	};
	if (typeof require === 'function' && typeof module !== 'undefined') {
		Bindings.prototype.include = function (filename) {
			if (filename.charAt(0) === '.') {
				filename = require('path').join(process.cwd(), filename);
			}
			var after = function () {
				delete global.bindings;
			};
			if ('bindings' in global) {
				var oldValue = global.bindings;
				after = function () {
					global.bindings = oldValue;
				};
			}
			global.bindings = this;
			
			require(filename);
			var code = require('fs').readFileSync(filename, {encoding: 'utf-8'});
			code = '/*** ' + require('path').basename(filename) + ' ***/\n\n' + code;
			this._includeCode = this._includeCode || [];
			this._includeCode.push(code);
			
			after();
		};
		Bindings.prototype.bundle = function (skip) {
			var header = skip ? '' : '(function (bindings) {\n\n';
			var footer = skip ? '' : '\n\n})(JsonModel.bindings);';
			var includeCode = this._includeCode.join('\n\n').replace(/^(\r?\n)*/g, '').replace(/(\r?\n)*$/g, '');
			if (typeof this.parent.bundle === 'function') {
				includeCode += (includeCode ? '\n\n' : '') + this.parent.bundle;
			}
			return header + includeCode + footer;
		};
		api.bundle = function (bindings) {
			bindings = bindings || api.bindings;
			var code = ['/schema2js.js', '/model.js', '/model-bind.js'].map(function (filename) {
				var result = '/*** ' + filename + ' ***/\n\n';
				result += require('fs').readFileSync(__dirname + filename, {encoding: 'utf-8'});
				return result;
			});
			code.push(bindings.bundle());
			return code.join('\n\n');
		};
	}
	api.bindings = new Bindings();
	
	String.prototype.escapeHtml = function () {
		return this.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
		bindTo: function (element, bindings) {
			if (element.boundDataModel === this) return this;
			if (element.boundDataModel) {
				element.boundapi.unbindFrom(element);
			}
			var elementId;
			if (typeof element === 'string') {
				elementId = element;
				element = document.getElementById(elementId);
			}
			if (!element) {
				throw new Error("Element not found: " + elementId);
				return;
			}
			var currentBinding = null;
			
			bindings = binding || api.bindings;
			if (typeof bindings === 'function') {
				var constBinding = new Binding({
					dom: function (model) {
						var result = bindingHint(model);
						if (typeof result === 'string') result = Dom.fromHtml(result);
						return result;
					}
				});
				bindings = {select: function () {return constBinding;}};
			}
			
			var thisModel = this;
			var updateFunction = function (pointerPath) {
				var tagName = element.tagName.toLowerCase();
				var attrs = {};
				for (var i = 0; i < element.attributes.length; i++) {
					var attr = element.attributes[i];
					attrs[name] = attr.value;
				}
				var binding = bindings.select(thisModel, tagName, attrs);
				if (!binding) throw new Error('No suitable binding found');

				if (binding === currentBinding) {
					if (!binding.shouldUpdate(pointerPath, thisModel)) return;
				}
				if (binding !== currentBinding || binding.dom) {
					if (currentBinding && currentBinding.unbind) {
						currentBinding.unbind(thisModel, element);
					}
				}

				if (binding.dom) {
					var dom = binding.dom(thisModel, tagName, attrs);
					dom.coerce(element, thisModel);
				}

				currentBinding = binding;

				// Only call 'bind' once, as it will probably set up callbacks etc.
				if (binding.bind) {
					binding.bind(thisModel, element);
				}
			};
			// TODO: calculate binding on update
			//        - to handle DOM bindings, call binding.unbind() on old one first
			this.on('change', updateFunction);
			this.on('schemachange', updateFunction);
			updateFunction('', thisModel);

			element._dataModelUpdateFunction = updateFunction;
			element.boundDataModel = this;
			return this;
		},
		unbindFrom: function (element) {
			this.off('change', element._dataModelUpdateFunction);
			element.boundDataModel = null;
			return this;
		},
		html: function (tag, attrs, bindings, callback) {
			if (typeof tag !== 'string') {
				callback = bindings;
				bindings = attrs;
				attrs = tag;
				tag = null;
			}
			if (typeof attrs !== 'object' || attrs instanceof Bindings) {
				callback = bindings;
				bindings = attrs;
				attrs = null;
			}
			if (typeof bindings === 'function') {
				callback = bindings;
				bindings = null;
			}
			bindings = bindings || api.bindings;
			var htmlPrefix = '', htmlSuffix = '';
			if (tag || attrs) {
				htmlPrefix = openTag(tag || 'span');
				htmlSuffix = closeTag(tag);
			}
			tag = tag || 'div';
			attrs = attrs || {};
			
			var binding = bindings.select(this, tag, attrs);
			if (callback) {
				setTimeout(function () {
					var html = binding.html(this, tag, attrs);
					html = htmlPrefix + html + htmlSuffix;
					callback(null, html);
				}.bind(this), 10);
			} else {
				var html = binding.html(this, tag, attrs);
				html = htmlPrefix + html + htmlSuffix;
				return html;
			}
		}
	});
	
	api.timer = {
		wait: function (ms, listener) {
			var timer = null;	
			return function () {
				if (timer) clearTimeout(timer);
				var thiz = this;
				var args = arguments;
				timer = setTimeout(function () {
					timer = null;
					listener.apply(thiz, args);
				}, ms);
			};
		},
		limit: function (ms, listener) {
			var timer = null;	
			return function () {
				if (timer) return;
				var thiz = this;
				var args = arguments;
				timer = setTimeout(function () {
					timer = null;
					listener.apply(thiz, args);
				}, ms);
			};
		}
	};

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
	});
	
	return api;
});