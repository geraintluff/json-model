(function (JsonModel, bindings) {
	bindings.addHtml({
		tag: 'html'
	}, function (model, tag, attrs, context) {
		var html = '<head>';
		html += '<title>' + model.url().escapeHtml() + '</title>';
		html += '<style>' + bindings.bundleCss() + '</style>';
		html += '</head>';
		html += '<body onload="JsonModel.context.monitorLocation(document.body);">';
		html += '<div id="content">' + model.html() + '</div>';
		var js = JsonModel.bundleJs(bindings);
		js = js.replace(/<\//g, '\\u003c/');
		html += '<script>' + js + '</script>';
		html += '</body>';
		return html;
	});

	bindings.add({
		priority: -100,
		canBind: {type: 'object'},
		html: function (model, tag, attrs, context) {
			var html = '<div class="json-object">';
			model.props(function (prop, key) {
				html += '<div class="json-object-pair">';
				html += '<span class="json-object-key">' + key.escapeHtml() + ': </span>';
				html += prop.html();
				html += '</div>';
			});
			html += '</div>';
			return html;
		}
	});

	bindings.add({
		priority: -100,
		canBind: {type: 'array'},
		html: function (model, tag, attrs, context) {
			var html = '<div class="json-array">';
			model.items(function (item, index) {
				html += '<div class="json-array-item">';
				html += item.html();
				html += '</div>';
			});
			html += '</div>';
			return html;
		}
	});
	
	bindings.add({
		priority: -10,
		canBind: {},
		html: function (model, tag, attrs, context) {
			var html = '';
			var links = model.links();
			if (links.length) {
				html += '<span class="json-links">';
				links.forEach(function (link) {
					var stateUrl = context.urlForState(link.href, {});
					if (stateUrl) {
						html += '<a class="json-link" ajax href="' + stateUrl.escapeHtml() + '">' + link.rel.escapeHtml() + ': ' + link.href.escapeHtml() + '</a> ';
					} else {
						html += '<a class="json-link" href="' + link.href.escapeHtml() + '">' + link.rel.escapeHtml() + ': ' + link.href.escapeHtml() + '</a> ';
					}
				});
				html += '</span>';
			}
			html += model.html();
			return html;
		}
	});

	bindings.add({
		priority: -1,
		canBind: {type: 'array', tag: 'table'},
		html: function (model, tag, attrs, context) {
			var schemaSet = model.schemaSet().item();
			var keys = schemaSet.knownKeys();

			// Get extra keys
			// TODO: only do this if additionalProperties/patternProperties set?
			var properties = {};
			keys.forEach(function (key) {
				properties[key] = true;
			})
			model.items(function (item) {
				item.keys().forEach(function (key) {
					if (!properties[key]) {
						properties[key] = true;
						keys.push(key);
					}
				});
			});

			var header = '<tr class="json-array-header">';
			keys.forEach(function (key) {
				var title = schemaSet.prop(key).titles()[0] || key;
				header += '<th>' + title.escapeHtml() + '</th>';
			});
			header += '</tr>';
			
			return header + model.map(function (item, index) {
				var html = '<tr class="json-array-item">';
				html += item.mapProps(keys, function (prop, key, index) {
					return prop.html('td.json-array-item-key');
				}).join('');
				return html + '</tr>';
			}).join('');
		}
	});

})(JsonModel, JsonModel.bindings);