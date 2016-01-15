// Copyright (c) Microsoft Corporation
// All rights reserved. 
// Licensed under the Apache License, Version 2.0 (the ""License""); you may not use this file except in compliance with 
// the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0 
// 
// THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, EITHER EXPRESS OR IMPLIED, 
// INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE, 
// MERCHANTABLITY OR NON-INFRINGEMENT. 
// 
// See the Apache Version 2.0 License for specific language governing permissions and limitations under the License.

// Simple OData query builder based on DataJS and jQuery.

// Declare namespaces.
var OData = OData || {};
OData.explorer = OData.explorer || {};
OData.explorer.constants = OData.explorer.constants || {};

// Constants.
OData.explorer.constants.queryTimeout = 30 * 1000;
OData.explorer.constants.defaultTop = null;
OData.explorer.constants.displayErrorMessageDuration = 20 * 1000;

// The version.
OData.explorer.version = "1.1.0";

/// <summary>
/// Extends the built in String class with a format function if one is not already defined.
/// <code>
/// var input = '{0} and {1}';
/// var output = input.format('you', 'I') = 'you and I'
/// </code>
/// </summary>
if (!String.prototype.format) {
    String.prototype.format = function () {
        var args = arguments;
        return this.replace(/{(\d+)}/g, function (match, number) {
            return typeof args[number] != 'undefined' ? args[number] : match;
        });
    };
}

/// <summary>
/// Gives the child object a copy of the parent object's prototype.
/// </summary>
/// <param name="base" type="Method">The base method whose prototype will be copied.</param>
/// <param name="child" type="Method">The child method who will get a copy of the parent's prototype.</param>
/// <returns type="Method">The augmented child method is returned.</returns>
OData.extend = function (base, child) {
    child.prototype = new base();
    child.prototype.constructor = child;
    child.base = base.prototype;
    return child;
};

/// <summary>
/// Clean the OData endpoint url from extra / and $metadata.
/// </summary>
/// <param name ="url" type="String">The endpoint url.</param>
/// <returns type="String">The cleaned endpoint url.</returns>
OData.explorer._cleanODataEndpointUrl = function (url) {
    var metadataString = '$metadata';
    // Check if it ends with the word $metadata.
    if (url.indexOf(metadataString, url.length - metadataString.length) !== -1) {
        url = url.replace(metadataString, '');
    }

    if (url[url.length - 1] !== '/') {
        url += '/';
    }

    return url;
};

// ------------------------------------------------------------------------------
// The filters used to make meaningful queries to the service.
// ------------------------------------------------------------------------------

/// <summary>
/// Where clause filter options base class.
/// </summary>
OData.explorer.FilterOptions = function () {
    this.options = {
        encodeUrlComponents: false
    };
    this.values = [];
};

/// <summary>
/// Where clause filter base class init method.
/// </summary>
OData.explorer.FilterOptions.prototype.init = function (options) {
    for (var name in options) {
        this.options[name] = options[name];
    }
};

/// <summary>
/// Gets the filter options.
/// </summary>
/// <returns type="Array">An array with the filter objects.</returns>
OData.explorer.FilterOptions.prototype.getFilterOptions = function () {
    return this.values;
};

/// <summary>
/// Gets the where query.
/// Queries we want to be able to generate (examples):
/// Orders?$filter=startswith(Employee/FirstName, 'A') eq true
/// Orders?$filter=Employee/FirstName ne 'A'
/// Regions?$filter=Territories/any(x: x/RegionID eq 1)
/// Regions?$filter=Territories/any(x: substringof('so', x/TerritoryDescription) eq true)
/// </summary>
/// <param name="propertiesListNames">The list of property names.</param>
/// <param name="filterId">The id of the filter.</param>
/// <param name="value">The value of the property.</param>
/// <param name="propertiesListMultiplicityIsTrue">Multiplicity check.</param>
/// <returns type="String">The query string for the specified where filter.</returns>
OData.explorer.FilterOptions.prototype.getWhereQuery = function (propertiesListNames, filterId, value, propertiesListMultiplicityIsTrue) {
    if (!propertiesListNames || propertiesListNames.length === 0) {
        return '';
    }

    // Clean the input value by doubling the single ' with another one before and finally by escaping it.
    // Example: alert( escape("http://hello ' world") ); // displays: http%3A//hello%20%27%27%20world
    // First replace all the ' with '' (not ").
    value = String(value).replace(new RegExp("'", 'g'), "''");
    // Finally encode the value.
    if (this.options.encodeUrlComponents) {
        value = encodeURIComponent(value);
    }

    var filter = this.values[filterId];

    if (typeof propertiesListNames === 'string' || propertiesListNames.length == 1) {
        // We have only one property.
        return filter.stringFormat.format(propertiesListNames, value);
    }

    // We are handling navigation properties.
    var lastProperty = propertiesListNames[propertiesListNames.length - 1];
    var secondLastElementIndex = propertiesListNames.length - 2; // We previously checked that the length is >= 2
    var query = lastProperty;

    // Check if the previous navigation property has multiplicity, to know if we need to add the x/ or not.
    if (propertiesListMultiplicityIsTrue[secondLastElementIndex]) {
        query = 'x/' + query;
    }

    // Goal: Orders?$filter=startswith(Employee/FirstName, 'A') eq true
    // While the navigations have a 1:1 multiplicity, keep recursing and adding them because the function filter
    // has to be added only at the end.
    while (secondLastElementIndex >= 0 && !propertiesListMultiplicityIsTrue[secondLastElementIndex]) {
        query = this.createNavigationNoMultiplicityWhereQuery(propertiesListNames[secondLastElementIndex], query);
        secondLastElementIndex--;
    }

    // Done building the "Employee/FirstName" now add the filter startswith([...], 'A') eq true
    query = filter.stringFormat.format(query, value);

    // Keep adding the rest of the properties
    for (var i = secondLastElementIndex; i >= 0; i--) {
        if (propertiesListMultiplicityIsTrue[i]) {
            query = this.createNavigationAnyWhereQuery(propertiesListNames[i], query);
        } else {
            query = this.createNavigationNoMultiplicityWhereQuery(propertiesListNames[i], query);
        }
    }

    return query;
};

/// <summary>
/// Creates an "in any" where query clause against a navigation property.
/// e.g. Foo.svc/Bar?$filter=Users/any(x: x/IsHappy eq true)
/// </summary>
/// <param name="navigationProperty">The property name.</param>
/// <param name="propertyWhereQuery">The desired value(s) of the property.</param>
/// <returns type="String">Part of the query string for that specific navigation property.</returns>
OData.explorer.FilterOptions.prototype.createNavigationAnyWhereQuery = function (navigationProperty, propertyWhereQuery) {
    return navigationProperty + '/any(x: ' + propertyWhereQuery + ')';
};

/// <summary>
/// Creates a basic where query clause against a navigation property.
/// e.g. Foo.svc/Bar?$filter=Users/Name ne 'a'
/// </summary>
/// <param name="navigationProperty">The property name.</param>
/// <param name="propertyWhereQuery">The desired value of the property.</param>
/// <returns type="String">Part of the query string for that specific property.</returns>
OData.explorer.FilterOptions.prototype.createNavigationNoMultiplicityWhereQuery = function (navigationProperty, propertyWhereQuery) {
    return navigationProperty + '/' + propertyWhereQuery;
};

/// <summary>
/// Null where clause filter class.
/// </summary>
OData.explorer.NullFilterOptions = OData.extend(OData.explorer.FilterOptions, function (options) {
    this.init(options);
    this.values = [
           { errorMessage: 'You are not able to query on this property.' }
    ];
});

/// <summary>
/// Gets the where query, which for null is an empty string.
/// </summary>
OData.explorer.NullFilterOptions.prototype.getWhereQuery = function () {
    return '';
};

/// <summary>
/// Boolean where clause filter class.
/// </summary>
OData.explorer.BooleanFilterOptions = OData.extend(OData.explorer.FilterOptions, function (options) {
    this.init(options);
    this.values = [
            { displayName: 'is true', stringFormat: '{0} eq true', inputType: false },
            { displayName: 'is false', stringFormat: '{0} eq false', inputType: false }
    ];
});

/// <summary>
/// FloatingPoint where clause filter class.
/// </summary>
OData.explorer.FloatingPointFilterOptions = OData.extend(OData.explorer.FilterOptions, function (options) {
    this.init(options);
    this.values = [
            { displayName: 'round equals', stringFormat: 'round({0}) eq {1}', inputType: 'int' },
            { displayName: 'floor equals', stringFormat: 'floor({0}) eq {1}', inputType: 'int' },
            { displayName: 'ceiling equals', stringFormat: 'ceiling({0}) eq {1}', inputType: 'int' },
            { displayName: 'equals', stringFormat: '{0} eq {1}', inputType: 'double' },
            { displayName: 'not equals', stringFormat: '{0} ne {1}', inputType: 'double' },
            { displayName: 'greater than', stringFormat: '{0} gt {1}', inputType: 'double' },
            { displayName: 'greater than or equal to', stringFormat: '{0} ge {1}', inputType: 'double' },
            { displayName: 'less than', stringFormat: '{0} lt {1}', inputType: 'double' },
            { displayName: 'less than or equal to', stringFormat: '{0} le {1}', inputType: 'double' }
    ];
});

/// <summary>
/// Integer where clause filter class.
/// </summary>
OData.explorer.IntegerFilterOptions = OData.extend(OData.explorer.FilterOptions, function (options) {
    this.init(options);
    this.values = [
            { displayName: 'equals', stringFormat: '{0} eq {1}', inputType: 'int' },
            { displayName: 'not equals', stringFormat: '{0} ne {1}', inputType: 'int' },
            { displayName: 'greater than', stringFormat: '{0} gt {1}', inputType: 'int' },
            { displayName: 'greater than or equal to', stringFormat: '{0} ge {1}', inputType: 'int' },
            { displayName: 'less than', stringFormat: '{0} lt {1}', inputType: 'int' },
            { displayName: 'less than or equal to', stringFormat: '{0} le {1}', inputType: 'int' }
    ];
});

/// <summary>
/// Date and time where clause filter class.
/// </summary>
OData.explorer.DateTimeFilterOptions = OData.extend(OData.explorer.FilterOptions, function (options) {
    this.init(options);
    this.values = [
            {
                displayName: 'before',
                stringFormat: "{0} le datetime'{1}'",
                inputType: false,
                inputTypeOptions: ['now', 'yesterday', 'a week ago', 'a month ago', 'tomorrow', 'next week', 'next month']
            },
            {
                displayName: 'after',
                stringFormat: "{0} ge datetime'{1}'",
                inputType: false,
                inputTypeOptions: ['now', 'yesterday', 'a week ago', 'a month ago', 'tomorrow', 'next week', 'next month']
            },
            { displayName: 'year equals', stringFormat: 'year({0}) eq {1}', inputType: 'int' },
            { displayName: 'month number equals', stringFormat: 'month({0}) eq {1}', inputType: 'int' },
            { displayName: 'day number equals', stringFormat: 'day({0}) eq {1}', inputType: 'int' },
            { displayName: 'hour equals', stringFormat: 'hour({0}) eq {1}', inputType: 'int' },
            { displayName: 'minute equals', stringFormat: 'minute({0}) eq {1}', inputType: 'int' },
            { displayName: 'second equals', stringFormat: 'second({0}) eq {1}', inputType: 'int' }
    ];
});

/// <summary>
/// Gets the where query for DateTime objects.
/// </summary>
/// <param name="propertiesListNames">The list of property names.</param>
/// <param name="filterId">The id of the filter.</param>
/// <param name="value">The value of the property.</param>
/// <param name="propertiesListMultiplicityIsTrue">Multiplicity check.</param>
OData.explorer.DateTimeFilterOptions.prototype.getWhereQuery = function (propertiesList, filterId, value, propertiesListMultiplicityIsTrue) {
    switch (parseInt(filterId)) {
        case 0:
        case 1: {
            var time = new Date();
            var now = new Date();

            switch (parseInt(value)) {
                case 0: // now
                    break;
                case 1: // yesterday
                    time.setDate(now.getDate() - 1);
                    break;
                case 2: // a week ago
                    time.setDate(now.getDate() - 7);
                    break;
                case 3: // a month ago
                    time.setMonth(now.getMonth() - 1);
                    break;
                case 4: // tomorrow
                    time.setDate(now.getDate() + 1);
                    break;
                case 5: // next week
                    time.setDate(now.getDate() + 7);
                    break;
                case 6: // next month
                    time.setMonth(now.getMonth() + 1);
                    break;
                default:
                    return OData.explorer.DateTimeFilterOptions.base.getWhereQuery.call(
                        this, propertiesList, filterId, value, propertiesListMultiplicityIsTrue);
            }

            return OData.explorer.DateTimeFilterOptions.base.getWhereQuery.call(
                this, propertiesList, filterId, time.toISOString(), propertiesListMultiplicityIsTrue);
        }
    }

    return OData.explorer.DateTimeFilterOptions.base.getWhereQuery.call(
        this, propertiesList, filterId, value, propertiesListMultiplicityIsTrue);
};

/// <summary>
/// GUID where clause filter class.
/// </summary>
/// <param name="options">The options object.</param>
OData.explorer.GuidFilterOptions = OData.extend(OData.explorer.FilterOptions, function (options) {
    this.init(options);
    this.values = [
            { displayName: 'equals', stringFormat: "{0} eq guid'{1}'", inputType: 'guid' },
            { displayName: 'not equals', stringFormat: "{0} ne guid'{1}'", inputType: 'guid' }
    ];
});

/// <summary>
/// String where clause filter class.
/// </summary>
/// <param name="options">The options object.</param>
OData.explorer.StringFilterOptions = OData.extend(OData.explorer.FilterOptions, function (options) {
    this.init(options);
    this.values = [
            { displayName: 'equals', stringFormat: "{0} eq '{1}'", inputType: 'string' },
            { displayName: 'not equals', stringFormat: "{0} ne '{1}'", inputType: 'string' },
            { displayName: 'in (; separated)', stringFormat: "{0} eq '{1}'", inputType: 'string' },
            { displayName: 'case-insensitive equals', stringFormat: "tolower({0}) eq tolower('{1}')", inputType: 'string' },
            { displayName: 'case-insensitive does not equal', stringFormat: "tolower({0}) eq tolower('{1}')", inputType: 'string' },
            { displayName: 'starts with', stringFormat: "startswith({0}, '{1}') eq true", inputType: 'string' },
            { displayName: 'does not start with', stringFormat: "startswith({0}, '{1}') eq false", inputType: 'string' },
            { displayName: 'ends with', stringFormat: "endswith({0}, '{1}') eq true", inputType: 'string' },
            { displayName: 'does not end with', stringFormat: "endswith({0}, '{1}') eq false", inputType: 'string' },
            { displayName: 'contains', stringFormat: "substringof('{1}', {0}) eq true", inputType: 'string' },
            { displayName: 'has length', stringFormat: "length({0}) eq {1}", inputType: 'int' }
    ];
});

/// <summary>
/// Gets the where query for String objects.
/// </summary>
/// <param name="propertiesListNames">The list of property names.</param>
/// <param name="filterId">The id of the filter.</param>
/// <param name="value">The value of the property.</param>
/// <param name="propertiesListMultiplicityIsTrue">Multiplicity check.</param>
OData.explorer.StringFilterOptions.prototype.getWhereQuery = function (propertiesList, filterId, value, propertiesListMultiplicityIsTrue) {
    var index = parseInt(filterId);
    var filter = this.values[index];

    switch (filter.displayName) {
        case 'in (; separated)': {
            var valueSegments = value.split(';');
            var finalValue = [];
            for (var i = 0; i < valueSegments.length; i++) {
                finalValue.push(OData.explorer.StringFilterOptions.base.getWhereQuery.call(
                                this, propertiesList, filterId, valueSegments[i].trim(), propertiesListMultiplicityIsTrue));
            }

            return finalValue.join(' or ');
        }
    }

    return OData.explorer.StringFilterOptions.base.getWhereQuery.call(
        this, propertiesList, filterId, value, propertiesListMultiplicityIsTrue);
};

/// <summary>
/// Where clause filter class.
/// </summary>
/// <param name="options">The options object.</param>
OData.explorer.WhereFilterOptions = function (options) {
    this['Null'] = new OData.explorer.NullFilterOptions(options);
    this['Edm.Boolean'] = new OData.explorer.BooleanFilterOptions(options);
    this['Edm.Decimal'] =
        this['Edm.Single'] =
        this['Edm.Double'] = new OData.explorer.FloatingPointFilterOptions(options);
    this['Edm.Byte'] =
        this['Edm.SByte'] =
        this['Edm.Int16'] =
        this['Edm.Int32'] =
        this['Edm.Int64'] = new OData.explorer.IntegerFilterOptions(options);
    this['Edm.Time'] =
        this['Edm.DateTime'] =
        this['Edm.DateTimeOffset'] = new OData.explorer.DateTimeFilterOptions(options);
    this['Edm.Guid'] = new OData.explorer.GuidFilterOptions(options);
    this['Edm.String'] = new OData.explorer.StringFilterOptions(options);
};

/// <summary>
/// Where clause filter class.
/// </summary>
OData.explorer.WhereFilterOptions.prototype.getFilterHandler = function (type) {
    if (this[type]) {
        return this[type];
    } else {
        return this.Null;
    }
};

// -----------------------------------------------------------------------------------
// The query builder class, which knows everything about entities, properties, etc.
// -----------------------------------------------------------------------------------

/// <summary>
/// Query builder class.
/// </summary>
/// <param name="oDataUrlEndpoint">The URL of the service endpoint to read the metadata from.</param>
/// <param name ="metadataInput" type="Object">The metadata associated with the endpoint. 
/// If this parameter is passed, we will use it to generate the querybuilder without fetching from the service.</param>
/// <param name="options">The options object.</param>
OData.explorer.QueryBuilder = function (oDataUrlEndpoint, metadataInput, options) {
    if (!oDataUrlEndpoint) {
        throw 'You must specify the OData service endpoint URL.';
    }

    this.options = options || {};

    // Constants.
    this.multiplicityValues = ["0..1", "1", "*"];
    this.maxNavigationRecursion = 1;

    // Metadata and schema variables.
    this.metadata = metadataInput;
    this.entities = null;
    this.association = null;
    this.namespace = null;
    this.entitySchema = null;
    this.entitySet = null;
    this.associationSet = null;

    // Query variables.
    this.oDataUrl = OData.explorer._cleanODataEndpointUrl(oDataUrlEndpoint);
    this.top = null;
    this.skip = null;
    this.selectedEntityId = null;
    this.whereFilterId = 0;
    this.whereFilter = [];
    this.orderByPropertyList = [];
    this.columnsList = [];
    this.expandList = [];
    this.filterOptions = new OData.explorer.WhereFilterOptions(this.options);

    if (this.metadata) {
        this._updateMetadata(this.metadata);
    }
};

OData.explorer.QueryBuilder.prototype.initialize = function () {
    var deferred = $.Deferred();
    if (!this.metadata) {
        OData.read({ requestUri: this.getODataUrl() + '$metadata' },
            // Success callback.
            $.proxy(function (data) {
                this.metadata = data;
                this._updateMetadata(this.metadata);
                deferred.resolve();
            }, this),
            // Error callback.
            function (err) {
                var error = JSON.stringify(err);
                deferred.reject(error);
            },
            OData.metadataHandler);
    } else {
        deferred.resolve();
    }

    return deferred;
};

/// <summary>
/// Updates the metadata.
/// </summary>
/// <param name="someMetadata">The new metadata to use.</param>
OData.explorer.QueryBuilder.prototype._updateMetadata = function (someMetadata) {
    this.metadata = someMetadata;
    for (var e in this.metadata.dataServices.schema) {
        var schema = this.metadata.dataServices.schema[e];
        if (schema.entityType) {
            this.entities = schema.entityType;
            this.association = schema.association;
            this.namespace = schema.namespace;
        }

        if (schema.entityContainer) {
            this.entitySchema = schema;
            this.entitySet = schema.entityContainer[0].entitySet;
            this.associationSet = schema.entityContainer[0].associationSet;
        }
    }

    this.selectedEntityId = null;
    this.whereFilterId = 0;
    this.whereFilter = [];
    this.orderByPropertyList = [];
    this.columnsList = [];
    this.expandList = [];
};

/// <summary>
/// Set the top value in the final query.
/// </summary>
/// <param name ="val" type="String">The top value.</param>
OData.explorer.QueryBuilder.prototype.setTop = function (val) {
    this.top = isNaN(parseInt(val)) ? null : parseInt(val);
};

/// <summary>
/// Set the skip value in the final query.
/// </summary>
/// <param name ="val" type="String">The skip value.</param>
OData.explorer.QueryBuilder.prototype.setSkip = function (val) {
    this.skip = isNaN(parseInt(val)) ? null : parseInt(val);
};

/// <summary>
/// Set the selected entity in the final query.
/// </summary>
/// <param name ="entityId" type="Integer">The entity id.</param>
OData.explorer.QueryBuilder.prototype.setSelectedEntityId = function (entityId) {
    this.selectedEntityId = entityId;
};

/// <summary>
/// Add/Change/Remove a property from the expand filter in the OData query.
/// </summary>
/// <param name ="propertyId" type="Integer">The property id.</param>
/// <param name ="val" type="Integer">0 = remove, 1 = add</param>
OData.explorer.QueryBuilder.prototype.setExpandProperty = function (propertyId, val) {
    this._setPropertyValueInArray(this.expandList, propertyId, val);
};

/// <summary>
/// Add/Change/Remove a property from the select filter in the OData query.
/// </summary>
/// <param name ="propertyId" type="Integer">The property id.</param>
/// <param name ="val" type="Integer">0 = remove, 1 = add</param>
OData.explorer.QueryBuilder.prototype.setSelectColumnProperty = function (propertyId, val) {
    this._setPropertyValueInArray(this.columnsList, propertyId, val);
};

/// <summary>
/// Add/Change/Remove a property from the orderby filter in the OData query.
/// </summary>
/// <param name ="propertyId" type="Integer">The property id.</param>
/// <param name ="val" type="Integer">0 = do not sort on this property, 1 = sort asc, 2 = sort desc</param>
OData.explorer.QueryBuilder.prototype.setOrderByProperty = function (propertyId, val) {
    if (val !== 0 && val !== 1 && val !== 2) {
        throw 'Not acceptable sorting value: ' + val;
    }

    this._setPropertyValueInArray(this.orderByPropertyList, propertyId, val);
};

/// <summary>
/// Add/Change/Remove a property from the orderby filter in the OData query.
/// </summary>
/// <param name ="array" type="array">The array.</param>
/// <param name ="propertyId" type="Integer">The property id.</param>
/// <param name ="val" type="Integer">0 = do not sort on this property, 1 = sort asc, 2 = sort desc</param>
OData.explorer.QueryBuilder.prototype._setPropertyValueInArray = function (array, propertyId, val) {
    // Try to see if the property is already in the array.
    for (var i in array) {
        if (array[i].propertyId == propertyId) {
            // Remove the property from the array.
            if (val == 0) {
                array.splice(i, 1);
            } else { // Change the value of the property in the array.
                array[i].value = val;
            }
            return;
        }
    }

    // Add new one.
    var element = {
        propertyId: propertyId,
        value: val
    };

    array.push(element);
};

/// <summary>
/// Clear the expand filter list.
/// </summary>
OData.explorer.QueryBuilder.prototype.clearExpandProperty = function () {
    this.expandList.length = 0;
};

/// <summary>
/// Clear the select filter list.
/// </summary>
OData.explorer.QueryBuilder.prototype.clearSelectColumnsProperty = function () {
    this.columnsList.length = 0;
};

/// <summary>
/// Clear the orderby filter list.
/// </summary>
OData.explorer.QueryBuilder.prototype.clearOrderByProperty = function () {
    this.orderByPropertyList.length = 0;
};

/// <summary>
/// Return the endpoint url.
/// </summary>
/// <returns type="String">The OData endpoint url.</returns>
OData.explorer.QueryBuilder.prototype.getODataUrl = function () {
    return this.oDataUrl;
};

/// <summary>
/// Return the parsed metadata object.
/// </summary>
/// <returns type="Object">The metadata.</returns>
OData.explorer.QueryBuilder.prototype.getMetadata = function () {
    return this.metadata;
};

/// <summary>
/// Return how deep we can navigate inside navigation properties.
/// </summary>
/// <returns type="Integer">How deep we can navigate inside navigation properties.</returns>
OData.explorer.QueryBuilder.prototype.getMaxNavigationRecursion = function () {
    return this.maxNavigationRecursion;
};

/// <summary>
/// Return the selected entity id.
/// </summary>
/// <returns type="Integer">The selected entity id.</returns>
OData.explorer.QueryBuilder.prototype.getSelectedEntityId = function () {
    return this.selectedEntityId;
};

/// <summary>
/// Return all the entities' names, excluding abstract entities.
/// </summary>
/// <returns type="Array">An array with the entities names, ids, and objects.</returns>
OData.explorer.QueryBuilder.prototype.getEntitiesNames = function () {
    var entitiesNames = this._getNamesValueFromEntities(this.entities);

    var filteredEntitiesNames = [];
    // We do not display abstract classes.
    for (var i = 0, l = entitiesNames.length; i < l; i++) {
        if (!entitiesNames[i].entity.abstract) {
            filteredEntitiesNames.push(entitiesNames[i]);
        }
    }

    return filteredEntitiesNames;
};

/// <summary>
/// Return a sorted list of entities' names with padding for hierarchical entitites.
/// We need to sort them. They may have a tree structure. This solution is a partial sorting based on the
/// assumption that all the children of an entity are allways grouped togehter (but not sorted).
/// </summary>
/// <param name ="theEntities" type="Array">A list of all the entities.</param>
/// <param name ="theInheritanceLevel" type="Integer">Parameter used in the recursion steps to know 
/// the level of inheritance of the previous entity. The default value is 0.</param>
/// <param name ="index" type="Integer">Index in the "theEntities" array. Used in the recursion step. The default value is 0.</param>
/// <returns type="Array">An array with the entities' names.</returns>
OData.explorer.QueryBuilder.prototype._getNamesValueFromEntities = function (theEntities, theInheritanceLevel, index) {
    theInheritanceLevel = theInheritanceLevel || 0;
    index = index || 0;

    var keys = [];
    var position = 0;

    // Default padding for hierarchy up to 4 levels. 
    // If the hierarchy is deeper, new levels will be created automatically.
    var padding = ['', '. . ', , '. . . . ', , '. . . . . . '];

    for (var i = index, l = theEntities.length; i < l; i++) {
        var level = this._getNumberOfLevelOfInheritance(theEntities[i]);
        var paddingLevel = this._getNumberOfLevelOfInheritance(theEntities[i], true);

        // Add new padding levels for very deep hierarchies.
        if (!padding[paddingLevel]) {
            padding[paddingLevel] = Array(paddingLevel + 1).join(padding[1]);
        }

        if (level < theInheritanceLevel) {
            // Base step.
            return keys;
        } else if (level == theInheritanceLevel) {
            var entry = {
                key: i,
                value: padding[paddingLevel] + theEntities[i].name,
                inheritanceLevel: level,
                entity: theEntities[i]
            };

            position = this._locationOf(entry, keys);

            keys.splice(position, 0, entry);
        } else if (level > theInheritanceLevel) {
            // Recursion step.
            var result = this._getNamesValueFromEntities(theEntities, level, i);
            var args = [position + 1, 0].concat(result);
            Array.prototype.splice.apply(keys, args);

            i += result.length - 1;
        }
    }
    return keys;
};

/// <summary>
/// Return the location of the element in the dictionary, by value comparison.
/// </summary>
/// <param name ="element" type="Object">The element.</param>
/// <param name ="dictionary" type="Array">The array to be searched.</param>
/// <returns type="String">The index in the dictionary.</returns>
OData.explorer.QueryBuilder.prototype._locationOf = function (element, dictionary) {
    for (var i = dictionary.length - 1; i >= 0; i--) {
        if (dictionary[i].inheritanceLevel == element.inheritanceLevel &&
            dictionary[i].value >= element.value) {
            return i;
        }
    }

    // Not found.
    return dictionary.length;
};

/// <summary>
/// Return the entity by its id.
/// </summary>
/// <param name ="entityId" type="Integer">The entity id.</param>
/// <returns type="Object">The entity.</returns>
OData.explorer.QueryBuilder.prototype._getEntityById = function (entityId) {
    return this.entities[entityId];
};

/// <summary>
/// Return the entity by its name.
/// </summary>
/// <param name ="entityName" type="String">The entity name.</param>
/// <returns type="Object">The entity.</returns>
OData.explorer.QueryBuilder.prototype._getEntityByName = function (entityName) {
    for (var i = this.entities.length - 1; i >= 0; i--) {
        if (this.entities[i].name == entityName) {
            return this.entities[i];
        }
    }

    return undefined;
};

/// <summary>
/// Return the entity id by its name.
/// </summary>
/// <param name ="entityName" type="String">The entity name.</param>
/// <returns type="Object">The entity.</returns>
OData.explorer.QueryBuilder.prototype._getEntityIdByName = function (entityName) {
    for (var i = this.entities.length - 1; i >= 0; i--) {
        if (this.entities[i].name == entityName) {
            return i;
        }
    }

    return undefined;
};

/// <summary>
/// Return the root base entity for the entity passed as an argument.
/// </summary>
/// <param name ="entity" type="Object">The entity.</param>
/// <returns type="Object">The entity.</returns>
OData.explorer.QueryBuilder.prototype._getRootParentEntity = function (entity) {
    var baseType = entity.baseType;

    // If it is a hierarchical entity.
    if (typeof baseType !== 'undefined' && baseType != null) {
        var baseEntityName = baseType.replace(this.namespace + '.', '');
        var baseEntity = this._getEntityByName(baseEntityName);

        return this._getRootParentEntity(baseEntity);
    }

    return entity;
};

/// <summary>
/// Return the number of levels of class inheritance in the hierarchy of the specified entity.
/// </summary>
/// <param name ="entity" type="Object">The entity.</param>
/// <param name ="skipAbstract" type="Boolean">If true it will not count abstract classes in the inheritance path.</param>
/// <returns type="Integer">The number of level of inheritance.</returns>
OData.explorer.QueryBuilder.prototype._getNumberOfLevelOfInheritance = function (entity, skipAbstract) {
    skipAbstract = skipAbstract || false;
    var baseType = entity.baseType;

    // If it is a hierarchical entity.
    if (typeof baseType !== 'undefined' && baseType != null) {
        var baseEntityName = baseType.replace(this.namespace + '.', '');
        var baseEntity = this._getEntityByName(baseEntityName);

        if (skipAbstract && baseEntity.abstract) {
            return this._getNumberOfLevelOfInheritance(baseEntity, skipAbstract);
        }

        return 1 + this._getNumberOfLevelOfInheritance(baseEntity);
    }

    return 0;
};

/// <summary>
/// Return the properties and navigation properties.
/// </summary>
/// <param name ="entityId" type="Integer">The entity id.</param>
/// <param name ="onlyProperties" type="Boolean">If true it will not return navigation properties.</param>
/// <returns type="Array">An array with the properties and navigation properties (if onlyProperties != false).</returns>
OData.explorer.QueryBuilder.prototype.getQueryPropertiesAndNavigationPropertiesForEntity = function (entityId) {
    var properties = this.getQueryPropertiesForEntity(entityId);
    var navigationProps = this.getQueryNavigationPropertiesForEntity(entityId);

    var keys = properties.concat(navigationProps);

    return keys.sort(this._sortDictionaryByValueComparator);
};

/// <summary>
/// Return the properties.
/// </summary>
/// <param name ="entityId" type="Integer">The entity id.</param>
OData.explorer.QueryBuilder.prototype.getQueryPropertiesForEntity = function (entityId) {
    var keys = [];
    var index = 0;

    var properties = this._getPropertyNamesForEntity(entityId);
    for (var i = 0, l = properties.length; i < l; i++) {
        keys.push({
            key: index++,
            value: properties[i].value,
            id: properties[i].key,
            type: "property"
        });
    }

    return keys.sort(this._sortDictionaryByValueComparator);
};

/// <summary>
/// Return the navigation properties.
/// </summary>
/// <param name ="entityId" type="Integer">The entity id.</param>
OData.explorer.QueryBuilder.prototype.getQueryNavigationPropertiesForEntity = function (entityId) {
    var keys = [];

    // The index for navigations start after the properties!
    var index = this._getPropertyNamesForEntity(entityId).length;

    var navigationProps = this._getNavigationPropertyNamesForEntity(entityId);
    for (var i = 0, l = navigationProps.length; i < l; i++) {
        keys.push({
            key: index++,
            value: navigationProps[i].value,
            id: navigationProps[i].key,
            type: "navigationProperty"
        });
    }

    return keys.sort(this._sortDictionaryByValueComparator);
};

/// <summary>
/// Compare the two objects by value
/// </summary>
/// <param name ="element1" type="Object">The first element.</param>
/// <param name ="element2" type="Object">The second element.</param>
/// <returns type="Integer">-1 if the first element comes first, 0 if they have the same value, 1 otherwise.</returns>
OData.explorer.QueryBuilder.prototype._sortDictionaryByValueComparator = function (element1, element2) {
    var a = element1.value;
    var b = element2.value;

    return a < b ? -1 : (a > b ? 1 : 0);
};

/// <summary>
/// Return the property or navigation property with the specified id.
/// </summary>
/// <param name ="entityId" type="Integer">The entity id.</param>
/// <param name ="propOrNavPropId" type="Integer">The property or navigation property id.</param>
/// <returns type="Array">The property or navigation property.</returns>
OData.explorer.QueryBuilder.prototype.getQueryPropertiesAndNavigationPropertiesFromQueryId = function (entityId, propOrNavPropId) {
    var keys = this.getQueryPropertiesAndNavigationPropertiesForEntity(entityId);

    for (var i = keys.length - 1; i >= 0; i--) {
        if (keys[i].key == propOrNavPropId) {
            return keys[i];
        }
    }

    return undefined;
};

/// <summary>
/// Return the keys for the entity.
/// </summary>
/// <param name ="entityId" type="Integer">The entity id.</param>
/// <returns type="Array">The entity's keys.</returns>
OData.explorer.QueryBuilder.prototype.getKeysForEntity = function (entityId) {
    var e = this.entities[entityId];
    var keys = e.key.propertyRef;

    return this._getNamesValueFromObject(keys);
};

/// <summary>
/// Return the acceptable properties for the entity, including also the base classes properties.
/// </summary>
/// <param name ="entityId" type="Integer">The entity id.</param>
/// <returns type="Array">The entity's properties.</returns>
OData.explorer.QueryBuilder.prototype._getAcceptableProperties = function (entityId) {
    var e = this.entities[entityId];
    var properties = e.property || [];

    // If it is a hierarchical entity add the base classes' properties.
    if (e.baseType) {
        var baseEntityName = e.baseType.replace(this.namespace + '.', '');
        var baseEntityId = this._getEntityIdByName(baseEntityName);
        var baseProperties = this._getAcceptableProperties(baseEntityId);

        properties = properties.concat(baseProperties);
    }

    return properties;
};

/// <summary>
/// Return the property names.
/// </summary>
/// <param name ="entityId" type="Integer">The entity id.</param>
/// <returns type="Array">The entity's properties' names.</returns>
OData.explorer.QueryBuilder.prototype._getPropertyNamesForEntity = function (entityId) {
    var properties = this._getAcceptableProperties(entityId);

    return this._getNamesValueFromObject(properties);
};

/// <summary>
/// Return the property.
/// </summary>
/// <param name ="entityId" type="Integer">The entity id.</param>
/// <param name ="propertyId" type="Integer">The property id.</param>
/// <returns type="Object">The entity's property.</returns>
OData.explorer.QueryBuilder.prototype._getPropertyForEntity = function (entityId, propertyId) {
    var properties = this._getAcceptableProperties(entityId);

    return properties[propertyId];
};

/// <summary>
/// Return the property with the specified property name.
/// </summary>
/// <param name ="entityId" type="Integer">The entity id.</param>
/// <param name ="propertyName" type="String">The property name.</param>
/// <returns type="Object">The entity's property.</returns>
OData.explorer.QueryBuilder.prototype._getPropertyForEntityFromName = function (entityId, propertyName) {
    var properties = this._getAcceptableProperties(entityId);

    for (var i = properties.length - 1; i >= 0; i--) {
        if (properties[i].name === propertyName) {
            return properties[i];
        }
    }

    return undefined;
};

/// <summary>
/// Return the filter options for the property.
/// </summary>
/// <param name ="entityId" type="Integer">The entity id.</param>
/// <param name ="propId" type="Integer">The property id.</param>
/// <returns type="Object">The filter options.</returns>
OData.explorer.QueryBuilder.prototype.getFilterOptionsForProperty = function (entityId, propId) {
    var properties = this._getAcceptableProperties(entityId);
    var prop = properties[propId];

    return this.filterOptions.getFilterHandler(prop.type).getFilterOptions();
};

/// <summary>
/// Return the acceptable navigation properties for the entity, including also the base classes properties
/// </summary>
/// <param name ="entityId" type="Integer">The entity id.</param>
/// <returns type="Array">The entity's navigation properties.</returns>
OData.explorer.QueryBuilder.prototype._getAcceptableNavigationProperties = function (entityId) {
    var e = this.entities[entityId];
    var navigationProperties = e.navigationProperty || [];

    // If it is a hierarchical entity add the base classes' properties.
    if (e.baseType) {
        var baseEntityName = e.baseType.replace(this.namespace + '.', '');
        var baseEntityId = this._getEntityIdByName(baseEntityName);
        var baseNavigationProperties = this._getAcceptableNavigationProperties(baseEntityId);

        navigationProperties = navigationProperties.concat(baseNavigationProperties);
    }

    return navigationProperties;
};

/// <summary>
/// Return the navigation property names.
/// </summary>
/// <param name ="entityId" type="Integer">The entity id.</param>
/// <returns type="Array">The entity's navigation properties.</returns>
OData.explorer.QueryBuilder.prototype._getNavigationPropertyNamesForEntity = function (entityId) {
    var navigationProperties = this._getAcceptableNavigationProperties(entityId);

    return this._getNamesValueFromObject(navigationProperties);
};

/// <summary>
/// Return the navigation property.
/// </summary>
/// <param name ="entityId" type="Integer">The entity id.</param>
/// <param name ="navPropId" type="Integer">The navigation property id.</param>
/// <returns type="Object">The entity's navigation property.</returns>
OData.explorer.QueryBuilder.prototype._getNavigationPropertyForEntity = function (entityId, navPropId) {
    var index = this._getPropertyNamesForEntity(entityId).length;
    var navigationProperties = this._getAcceptableNavigationProperties(entityId);

    return navigationProperties[navPropId - index];
};

/// <summary>
/// Return the navigation property's entity id that it is referring to.
/// </summary>
/// <param name ="entityId" type="Integer">The entity id.</param>
/// <param name ="navPropId" type="Integer">The navigation property id.</param>
/// <returns type="Object">The entity id.</returns>
OData.explorer.QueryBuilder.prototype.getNavigationPropertyReferringEntityId = function (entityId, navPropId) {
    var navigationProperty = this._getNavigationPropertyForEntity(entityId, navPropId);

    return this._getReferringEntityIdFromNavigationProperty(navigationProperty);
};

/// <summary>
/// Return the final OData query url.
/// </summary>
/// <returns type="String">The query url.</returns>
OData.explorer.QueryBuilder.prototype.getGeneratedODataQueryUrl = function () {
    var url = this.getODataUrl();

    // 0 is an acceptable value therefore we need to compare it like this.
    if (typeof this.selectedEntityId !== "undefined" && this.selectedEntityId != null) {
        var entityQueryName = this._getEntityQueryName(this.selectedEntityId);

        if (typeof entityQueryName === "undefined") {
            throw 'Invalid entity selected with id: ' + this.selectedEntityId;
        }

        url += entityQueryName + '?';
    }

    if (typeof this.skip !== "undefined" && this.skip != null) {
        url += '$skip=' + this.skip + '&';
    }

    if (typeof this.top !== "undefined" && this.top != null) {
        url += '$top=' + this.top + '&';
    }

    if (this.whereFilter && this.whereFilter.length > 0) {
        var queryFiltersString = this._getWhereQueryFilter(this.whereFilter);

        if (typeof queryFiltersString === "undefined") {
            throw 'Invalid query filters selected with id: ' + JSON.stringify(this.whereFilter);
        }

        url += '$filter=' + queryFiltersString + '&';
    }

    if (typeof this.selectedEntityId !== "undefined" && this.selectedEntityId != null) {
        if (this.orderByPropertyList && this.orderByPropertyList.length > 0) {
            url += '$orderby=';

            var sortingOptions = [];

            for (var i in this.orderByPropertyList) {
                var propertyId = this.orderByPropertyList[i].propertyId;
                var value = this.orderByPropertyList[i].value;
                var propertyName = this._getPropertyForEntity(this.selectedEntityId, propertyId).name;

                if (propertyName) {
                    switch (value) {
                        case 0: {
                            // Do not order by this propertyId.
                            break;
                        }
                        case 1: {
                            // Sort in asc order.
                            sortingOptions.push(propertyName);
                            break;
                        }
                        case 2: {
                            // Sort in desc order.
                            sortingOptions.push(propertyName + ' desc');
                            break;
                        }
                    }
                }
            }

            // Separate the elements with a comma ',' and add the '&' at the end.
            url += sortingOptions.join() + '&';
        }

        if (this.columnsList && this.columnsList.length > 0) {
            url += '$select=';

            var selectOptions = [];

            for (var i in this.columnsList) {
                var propertyId = this.columnsList[i].propertyId;
                var propertyName = this._getPropertyForEntity(this.selectedEntityId, propertyId).name;

                selectOptions.push(propertyName);
            }

            // Separate the elements with a comma ',' and add the '&' at the end.
            url += selectOptions.join() + '&';
        }

        if (this.expandList && this.expandList.length > 0) {
            url += '$expand=';

            var expandOptions = [];

            for (var i in this.expandList) {
                var navigationPropertyId = this.expandList[i].propertyId;
                var navigationPropertyName = this._getNavigationPropertyForEntity(this.selectedEntityId, navigationPropertyId).name;

                expandOptions.push(navigationPropertyName);
            }

            // Separate the elements with a comma ',' and add the '&' at the end.
            url += expandOptions.join() + '&';
        }
    }

    // Remove the & at the end.
    var lastUrlCharIndex = url.length - 1;
    if (url[lastUrlCharIndex] === '&') {
        url = url.substring(0, lastUrlCharIndex);
    }

    return url;
};

/// <summary>
/// Return the next filter id, used to know which of the filters we are adding/modifying/deleting.
/// </summary>
/// <returns type="String">The next where filter id.</returns>
OData.explorer.QueryBuilder.prototype.getNextWhereId = function () {
    return 'odataExplorerFilter' + this.whereFilterId++;
};

/// <summary>
/// Clear the filter list for the OData final query url.
/// </summary>
OData.explorer.QueryBuilder.prototype.emptyWhereFilter = function () {
    this.whereFilter = [];
};

/// <summary>
/// Delete a specific filter in the filter list.
/// </summary>
/// <param name ="specificId" type="Integer">The filter id, which has to be removed.</param>
OData.explorer.QueryBuilder.prototype.removeWhereFilter = function (specificId) {
    for (var i = this.whereFilter.length - 1; i >= 0; i--) {
        // Only doing double equals here because sometimes the id is of type string and sometimes int.
        if (this.whereFilter[i].id == specificId) {
            this.whereFilter.splice(i, 1);
            break;
        }
    }
};

/// <summary>
/// Add or update a specific filter in the filter list.
/// </summary>
/// <param name ="specificId" type="Integer">The filter id, which has to be added or updated.</param>
/// <param name ="propListNames" type="Array">A list of property names.</param>
/// <param name ="propListIds" type="Array">A list of property ids.</param>
/// <param name ="propListReferringEntityIds" type="Array">A list of the referring entity for every 
/// navigation property in the query.</param>
/// <param name ="propFilterId" type="Integer">The property filter id.</param>
/// <param name ="val" type="String/Integer">The value for the filter.</param>
OData.explorer.QueryBuilder.prototype.addOrUpdateWhereFilter = function (specificId, propListNames, propListIds, propListReferringEntityIds, propFilterId, val) {
    var whereClause = {
        id: specificId,
        propertyListNames: propListNames,
        propertyListReferringEntityIds: propListReferringEntityIds,
        propertiesListIds: propListIds,
        propertyFilterId: propFilterId,
        value: val
    };

    // Check if element already exist.
    for (var i = this.whereFilter.length - 1; i >= 0; i--) {
        if (this.whereFilter[i].id === specificId) {
            // Update.
            this.whereFilter[i] = whereClause;
            return;
        }
    }

    // Element not found: add a new one.
    this.whereFilter.push(whereClause);
};

/// <summary>
/// Return a standardized array of objects for the array passed as a parameter.
/// </summary>
/// <param name ="obj" type="Array">A list of objects with a name property.</param>
/// <param name ="startIndex" type="int">The starting index number.</param>
/// <returns type="Array">A standardized array of objects for the array passed as a parameter.</returns>
OData.explorer.QueryBuilder.prototype._getNamesValueFromObject = function (obj, startIndex) {
    startIndex = startIndex || 0;
    var keys = [];
    for (var i = 0, l = obj.length; i < l; i++) {
        keys.push({ key: i + startIndex, value: obj[i].name, object: obj[i] });
    }
    return keys;
};

/// <summary>
/// Return the where filters formatted for the final OData query url.
/// </summary>
/// <param name ="whereFilterList" type="Array">A list of all the query filters.</param>
/// <returns type="String">The where filters formatted for the final OData query url.</returns>
OData.explorer.QueryBuilder.prototype._getWhereQueryFilter = function (whereFilterList) {
    var result = '';

    for (var i = 0, l = whereFilterList.length; i < l; i++) {
        var filter = whereFilterList[i];
        var propertyListNames = filter.propertyListNames;
        var propertiesListIds = filter.propertiesListIds;
        var propListReferringEntityIds = filter.propertyListReferringEntityIds;
        var lastPropName = propertyListNames[propertyListNames.length - 1];
        var lastPropReferringEntityId = propListReferringEntityIds[propListReferringEntityIds.length - 1];

        var propertiesListMultiplicityIsTrue = [];
        for (var k = 0, t = propertiesListIds.length; k < t; k++) {
            var referringEntityId = propListReferringEntityIds[k];
            var id = propertiesListIds[k];
            var element = this.getQueryPropertiesAndNavigationPropertiesFromQueryId(referringEntityId, id);

            switch (element.type) {
                case 'navigationProperty':
                    var navigationProperty = this._getNavigationPropertyForEntity(referringEntityId, element.key);
                    var multiplicity = this._getNavigationPropertyMultiplicity(navigationProperty);
                    if (multiplicity <= 1) {
                        propertiesListMultiplicityIsTrue.push(false);
                    } else {
                        propertiesListMultiplicityIsTrue.push(true);
                    }
                    break;
                case 'property':
                    // Properties do not have multiplicity, because they are not navigations.
                    propertiesListMultiplicityIsTrue.push(false);
                    break;
            }
        }

        var prop = this._getPropertyForEntityFromName(lastPropReferringEntityId, lastPropName);
        var aQuery = this.filterOptions.getFilterHandler(prop.type).getWhereQuery(
            propertyListNames, filter.propertyFilterId, filter.value, propertiesListMultiplicityIsTrue);

        result += aQuery;

        if (i < l - 1) {
            result += ' and ';
        }
    }

    return result;
};

/// <summary>
/// Return the multiplicity for the navigation property.
/// </summary>
/// <param name ="navigationProperty" type="Object">The navigation property.</param>
/// <returns type="String">The multiplicity for the navigation property.</returns>
OData.explorer.QueryBuilder.prototype._getNavigationPropertyMultiplicity = function (navigationProperty) {
    if (!navigationProperty) {
        return undefined;
    }

    var relationshipName = navigationProperty.relationship;
    var toRoleName = navigationProperty.toRole;

    var correctAssociationSet = this._getAssociationSetFromRelationshipName(relationshipName);

    if (!correctAssociationSet) {
        return undefined;
    }

    var correctAssociation = this._getAssociationFromAssociationSet(correctAssociationSet);
    var multiplicity;

    if (!correctAssociation) {
        return undefined;
    } else if (correctAssociation.end[0].role == toRoleName) {
        multiplicity = correctAssociation.end[0].multiplicity;
    } else if (correctAssociation.end[1].role == toRoleName) {
        multiplicity = correctAssociation.end[1].multiplicity;
    } else {
        return undefined;
    }

    return this.multiplicityValues.indexOf(multiplicity);
};

/// <summary>
/// Return the association set for the relationship.
/// </summary>
/// <param name ="relationshipName" type="String">The relationship name.</param>
/// <returns type="String">The association set for the relationship.</returns>
OData.explorer.QueryBuilder.prototype._getAssociationSetFromRelationshipName = function (relationshipName) {
    if (!relationshipName) {
        return undefined;
    }

    for (var i = this.associationSet.length - 1; i >= 0; i--) {
        if (this.associationSet[i].association == relationshipName) {
            return this.associationSet[i];
        }
    }

    return undefined;
};

/// <summary>
/// Return the association for the association set.
/// </summary>
/// <param name ="associationSet" type="String">The association set.</param>
/// <returns type="String">The association for the association set.</returns>
OData.explorer.QueryBuilder.prototype._getAssociationFromAssociationSet = function (associationSet) {
    if (!associationSet) {
        return undefined;
    }

    for (var i = this.association.length - 1; i >= 0; i--) {
        if (this.namespace + '.' + this.association[i].name == associationSet.association) {
            return this.association[i];
        }
    }

    return undefined;
};

/// <summary>
/// Return the referring entity for the specified navigation property.
/// </summary>
/// <param name ="navigationProperty" type="Object">The navigation property.</param>
/// <returns type="String">The entity id.</returns>
OData.explorer.QueryBuilder.prototype._getReferringEntityIdFromNavigationProperty = function (navigationProperty) {
    if (!navigationProperty) {
        return undefined;
    }

    var relationshipName = navigationProperty.relationship;
    var toRoleName = navigationProperty.toRole;

    var correctAssociationSet;
    var correctEntitySetName;

    // Retrieve the id from the entitySet using the associacionSet.
    correctAssociationSet = this._getAssociationSetFromRelationshipName(relationshipName);

    if (!correctAssociationSet) {
        return undefined;
    } else if (correctAssociationSet.end[0].role == toRoleName) {
        correctEntitySetName = correctAssociationSet.end[0].entitySet;
    } else if (correctAssociationSet.end[1].role == toRoleName) {
        correctEntitySetName = correctAssociationSet.end[1].entitySet;
    } else {
        return undefined;
    }

    for (var k = this.entitySet.length - 1; k >= 0; k--) {
        if (this.entitySet[k].name == correctEntitySetName) {
            var entityName = this.entitySet[k].entityType.slice(this.namespace.length + 1);
            return this.entities.indexOf(this._getEntityByName(entityName));
        }
    }

    return undefined;
};

/// <summary>
/// Return the entity name that has to be used in the final OData query url.
/// Example:
/// Not hierarchical model:
/// sometimes the name gets pluralized ex: Category -> Categories or it stays the same Account -> Account
/// Hierarchical model:
/// The path would be something like: 
/// Service.svc/Item/Service.Server where Ã¢ÂÂServerÃ¢ÂÂ extends Ã¢ÂÂDeviceÃ¢ÂÂ which extends Ã¢ÂÂItemÃ¢ÂÂ 
/// but the URL takes the form of .../Service.svc/<root base class>/<namespace>.<derived class> and 
/// all the intermediate classes in the hierarchy are Ã¢ÂÂignoredÃ¢ÂÂ (with regards to the URL).
/// </summary>
/// <param name ="entityId" type="Integer">The entity id.</param>
/// <returns type="String">The entity name.</returns>
OData.explorer.QueryBuilder.prototype._getEntityQueryName = function (entityId) {
    var entity = this._getEntityById(entityId);

    // If it is a hierarchical entity.
    if (typeof entity.baseType !== 'undefined') {
        var parentEntity = this._getRootParentEntity(entity);

        if (!parentEntity.abstract) {
            return this._getEntitySetQueryNameFromEntityName(parentEntity.name) + '/' +
                this.namespace + '.' + entity.name;
        }
    }

    return this._getEntitySetQueryNameFromEntityName(entity.name);
};

/// <summary>
/// Return the entitySet query name from the entity name.
/// </summary>
/// <param name ="entityName" type="String">The entity name.</param>
/// <returns type="String">The entitySet query name from the entity name.</returns>
OData.explorer.QueryBuilder.prototype._getEntitySetQueryNameFromEntityName = function (entityName) {
    if (!entityName) {
        throw 'Missing required parameter "name".';
    }

    var namespacedName = this.namespace + '.' + entityName;

    for (var i = this.entitySet.length - 1; i >= 0; i--) {
        if (this.entitySet[i].entityType === namespacedName) {
            return this.entitySet[i].name;
        }
    }

    return undefined;
};

// ------------------------------------------------------------------------------
// UI display functions and bindings.
// ------------------------------------------------------------------------------

/// <summary>
/// DataExplorer class which constructs the query builder and loads the query results.
/// </summary>
/// <param name="options">
/// Required: an array containing the different endpoints.
/// Optionals true|false parameters: 
///     encodeUrlComponents, hideOrderbyFilters, hideColumnFilters, hideExpandFilters
/// Optional override methods (examples):
///     onUrlChange: function (url) { }
///     onSubmit: function (url) { return url; }
///     onResults: function (data) { return data; }
///     onError: function (error, url) { }
/// </param>
OData.explorer.DataExplorer = function (options) {
    if (!options) {
        throw 'You must specify at least one parameter.';
    }

    this.options = {};

    // Set the options.
    if (options) {
        for (var option in options) {
            this.options[option] = options[option];
        }
    }

    if (options.url || $.isArray(options) && options.length !== 0) {
        // The options is the array of endpoints.
        this.options.endpoints = options;
    } else if (!options.endpoints ||
        (!options.endpoints.url && (!$.isArray(options.endpoints) || options.endpoints.length === 0))) {
        throw 'You must specify at least one endpoint URL.';
    }

    this.defaultTop = OData.explorer.constants.defaultTop;
    this.endpoints = this.options.endpoints.url ? [this.options.endpoints] : this.options.endpoints;

    // Find or create the container.
    this.$container = $('#queryBuilderContainer');
    if (this.$container.size() === 0) {
        this.$container = $('body').prepend('<div id="queryBuilderContainer" />');
    }

    // Create the control contents.
    this.$container.empty();
    this.$queryBuilder = $('<div id="queryBuilder" />');
    this.$results = $('<div id="results"></div>');
    this.$container.append(this.$queryBuilder, this.$results);
    this.$queryBuilder.append('<div id="queryBusy"></div>');
    this.$busy = $('#queryBusy', this.$queryBuilder);
    var $queryBuilderForm = $('<form autocomplete="off" id="queryBuilderForm" />');
    this.$queryBuilder.append($queryBuilderForm);
    $queryBuilderForm.append($([
        '<div class="row">',
            '<div class="col-md-12">',
                '<form role="form" id="myform">',
                    '<div class="page-header">',
                        '<h4>Service Selection</h4>',
                    '</div>',
                    
                    '<div class="form-group">',
                        '<label for="endpoints">Service Endpoint:</label>',
                        '<select id="endpoints" class="form-control"></select>',
                    '</div>',
                    
                    '<div id="queryFilters" class="form-group">',
                        '<label for="top">Select:</label>',
                        '<select id="top" class="form-control"></select>',
                    '</div>',
                    
                    '<div class="form-group">',
                        '<label for="entities">Group:</label>',
                        '<select id="entities" class="form-control"></select>',
                    '</div>',
                    
                    '<div class="page-header">',
                        '<h4>Filters</h4>',
                    '</div>',
                    
                    '<div id="filtersConditions" class="form-group">',
                        '<div id="whereConditions" class="filterContainer">',
                            '<label class="filterLabel">Where:</label>',
                            '<button id="addCondition" class="addCondition">+</button>',
                        '</div>',
                    
                        '<div id="orderByConditions" class="filterContainer form-group">',
                            '<label class="filterLabel">Order by:</label>',
                            '<button id="addOrderByCondition" class="addCondition">+</button>',
                            '<span id="orderByFiltersList" class="filterList"></span> ',
                        '</div>',
                        
                        '<div id="selectConditions" class="filterContainer form-group">',
                            '<label class="filterLabel">Columns:</label>',
                            '<button id="addSelectCondition" class="addCondition">+</button>',
                            '<span id="selectFiltersList" class="filterList"></span> ',
                        '</div>',
                        
                        '<div id="expandConditions" class="filterContainer form-group">',
                            '<label class="filterLabel">Expand:</label>',
                            '<button id="addExpandCondition" class="addCondition">+</button>',
                            '<span id="expandFiltersList" class="filterList"></span> ',
                        '</div>',
                    '</div>',
                    
                    '<div class="page-header">',
                        '<h4>Generated Query</h4>',
                    '</div>',
                    
                    '<a id="queryUrl" href="/" target="_blank"></a>',
                    
                    '<div class="page-header">',
                        '<h4>Data Browser</h4>',
                    '</div>',
                '</form>',
            '</div>',
        '</div>'].join('')));
    this.$whereConditions = $('#whereConditions', $queryBuilderForm);

    this.$orderByConditions = $('#orderByConditions', $queryBuilderForm);
    this.$addOrderByCondition = $('#addOrderByCondition', $queryBuilderForm);
    this.$orderByFiltersList = $('#orderByFiltersList', $queryBuilderForm);

    this.$selectConditions = $('#selectConditions', $queryBuilderForm);
    this.$addSelectCondition = $('#addSelectCondition', $queryBuilderForm);
    this.$selectFiltersList = $('#selectFiltersList', $queryBuilderForm);

    this.$expandConditions = $('#expandConditions', $queryBuilderForm);
    this.$addExpandCondition = $('#addExpandCondition', $queryBuilderForm);
    this.$expandFiltersList = $('#expandFiltersList', $queryBuilderForm);

    this.$filtersConditions = $('#filtersConditions', $queryBuilderForm);
    this.$entities = $('#entities', $queryBuilderForm);
    this.$queryFilters = $('#queryFilters', $queryBuilderForm);
    this.$addCondition = $('#addCondition', $queryBuilderForm);
    this.$queryUrl = $('#queryUrl', $queryBuilderForm);
    this.$top = $('#top', $queryBuilderForm);
    this.$skip = $('#skip', $queryBuilderForm);
    this.addOptions(
        [
            { key: null, value: 'All' },
            { key: 1, value: 'top 1' },
            { key: 10, value: 'top 10' },
            { key: 20, value: 'top 20' },
            { key: 50, value: 'top 50' },
            { key: 100, value: 'top 100' }
        ],
        this.$top);
    this.$endpoints = $('#endpoints', $queryBuilderForm);
    var endpointOptions = [];
    var endpointsCount = this.endpoints.length;
    for (var i = 0; i < endpointsCount; i++) {
        var endpoint = this.endpoints[i];
        endpointOptions.push({ key: endpoint.url, value: endpoint.name || endpoint.url });
    };

    this.addOptions(endpointOptions, this.$endpoints);

    this.$queryBuilder.append([
        '<div id="queryButtons" class="form-group">',
            '<button id="submitQuery" class="btn btn-primary">Search</button>',
            '<button id="clearQuery" class="btn btn-danger pull-right">Reset</button>',
        '</div>',
        '<div id="errorMessage" />'].join(''));
    this.$queryButtons = $('#queryButtons', this.$queryBuilder);
    this.$errorMessage = $("#errorMessage", this.$queryBuilder);
    this.$submitQuery = $('#submitQuery', this.$queryBuilder);
    this.$clearQuery = $('#clearQuery', this.$queryBuilder);

    // Cache of query builders for different URL's.
    this.queryBuilders = [];

    // Set the options.
    if (this.options.hideOrderbyFilters) {
        this.$orderByConditions.hide();
    }

    if (this.options.hideColumnFilters) {
        this.$selectConditions.hide();
    }

    if (this.options.hideExpandFilters) {
        this.$expandConditions.hide();
    }

    // Event handler for updating the metadata model.
    this.$endpoints.change($.proxy(function (event) {
        var url = OData.explorer._cleanODataEndpointUrl($(event.target).val());
        this.$queryFilters.hide();
        this.$queryButtons.hide();
        this.$results.empty();
        this.showErrorMessage('Generating the query builder...', -1);

        if (this.queryBuilders[url]) {
            this.queryBuilder = this.queryBuilders[url];
            this.Reset();
        } else {
            var endpoint = this.endpoints[event.target.selectedIndex];

            if (endpoint.provider) {
                this.queryBuilder = this.queryBuilders[url] =
                    new OData.explorer.QueryBuilder(url, endpoint.provider());
            } else {
                this.queryBuilder = this.queryBuilders[url] =
                    new OData.explorer.QueryBuilder(url);
            }

            var promise = this.queryBuilder.initialize();

            // The query builder has been successfully initialized.
            promise.done($.proxy(this.Reset, this));

            // The query builder has NOT been successfully initialized.
            promise.fail($.proxy(function (error) {
                this.queryBuilders[url] = null;
                this.Reset(error);
            }, this));
        }
    }, this));

    // Now that we have the event handler lets set the default selection and trigger the handler.
    this.$endpoints.val(this.$endpoints.find('option:first').val());
    this.$endpoints.change();
    if (endpointOptions.length === 1) {
        this.$endpoints.attr('disabled', true);
    }

    // Event handler for adding another criteria row when the plus button is clicked.
    this.$addCondition.click($.proxy(function (event) {
        // Prevent the default behaviour of the button from submitting the form.
        event.preventDefault();
        this.createNewWhereQuery();
    }, this));

    // Event handler for setting a skip value.
    this.$skip.keyup($.proxy(function (event) {
        var itemId = $(event.target).val();
        this.queryBuilder.setSkip(itemId);
        this.updateUrl(this.queryBuilder.getGeneratedODataQueryUrl());
    }, this));

    // Event handler for setting a top value.
    this.$top.change($.proxy(function (event) {
        var itemId = $(event.target).val();
        this.queryBuilder.setTop(itemId);
        this.updateUrl(this.queryBuilder.getGeneratedODataQueryUrl());
    }, this));

    // Event handler for adding order by conditions.
    this.$addOrderByCondition.click($.proxy(function (event) {
        // Prevent the default behaviour of the button from submitting the form.
        event.preventDefault();

        if (this.$orderByFiltersList.is(":visible")) {
            // Reset the order by filters when the list is being hidden.
            this.$orderByFiltersList.find('input[type="checkbox"]').prop('checked', false);
            this.queryBuilder.clearOrderByProperty();
            this.updateUrl(this.queryBuilder.getGeneratedODataQueryUrl());
        }

        this.$orderByConditions.toggleClass('listVisible');
    }, this));

    // Event handler for adding order by columns.
    this.$orderByFiltersList.on('click', ':input', $.proxy(function (event) {
        var $e = $(event.target);
        var propertyId = $e.val();
        var isChecked = +$e.is(':checked'); // The + converts the bool to integer.
        this.queryBuilder.setOrderByProperty(propertyId, isChecked);
        this.updateUrl(this.queryBuilder.getGeneratedODataQueryUrl());
    }, this));

    // Event handler for adding select column conditions.
    this.$addSelectCondition.click($.proxy(function (event) {
        // Prevent the default behaviour of the button from submitting the form.
        event.preventDefault();

        if (this.$selectFiltersList.is(":visible")) {
            // Reset the order by filters when the list is being hidden.
            this.$selectFiltersList.find('input[type="checkbox"]').prop('checked', false);
            this.queryBuilder.clearSelectColumnsProperty();
            this.updateUrl(this.queryBuilder.getGeneratedODataQueryUrl());
        }

        this.$selectConditions.toggleClass('listVisible');
    }, this));

    // Event handler for adding select columns.
    this.$selectFiltersList.on('click', ':input', $.proxy(function (event) {
        var $e = $(event.target);
        var propertyId = $e.val();
        var isChecked = +$e.is(':checked'); // The + converts the bool to integer.
        this.queryBuilder.setSelectColumnProperty(propertyId, isChecked);
        this.updateUrl(this.queryBuilder.getGeneratedODataQueryUrl());
    }, this));

    // Event handler for adding expand conditions.
    this.$addExpandCondition.click($.proxy(function (event) {
        // Prevent the default behaviour of the button from submitting the form.
        event.preventDefault();

        if (this.$expandFiltersList.is(":visible")) {
            // Reset the order by filters when the list is being hidden.
            this.$expandFiltersList.find('input[type="checkbox"]').prop('checked', false);
            this.queryBuilder.clearExpandProperty();
            this.updateUrl(this.queryBuilder.getGeneratedODataQueryUrl());
        }

        this.$expandConditions.toggleClass('listVisible');
    }, this));

    // Event handler for adding expands.
    this.$expandFiltersList.on('click', ':input', $.proxy(function (event) {
        var $e = $(event.target);
        var propertyId = $e.val();
        var isChecked = +$e.is(':checked'); // The + converts the bool to integer.
        this.queryBuilder.setExpandProperty(propertyId, isChecked);
        this.updateUrl(this.queryBuilder.getGeneratedODataQueryUrl());
    }, this));

    // Event handler for changing entity selection.
    this.$entities.change($.proxy(function (event) {
        var $e = $(event.target);
        var entityIndex = $e.val();
        if (entityIndex >= 0) {
            this.$queryButtons.show();
        } else {
            this.$queryButtons.hide();
        }

        this.resetQuery(entityIndex);
    }, this));

    // Event handler for clicking the cancel/clear/reset query button.
    this.$clearQuery.click($.proxy(function () {
        this.$queryButtons.hide();
        this.$entities.val(-1);
        this.resetQuery();
    }, this));

    // Event handler for removing a condition.
    this.$whereConditions.on('click', '.removeCondition', $.proxy(function (event) {
        var $e = $(event.target);
        var whereClauseId = $e.data('whereclauseid');
        $e.parent().remove();
        this.queryBuilder.removeWhereFilter(whereClauseId);
        this.updateUrl(this.queryBuilder.getGeneratedODataQueryUrl());
    }, this));

    // Event handler for clicking the submit search query button.
    this.$submitQuery.click($.proxy(function () {
        var url = this.getUrl();
        if (url) {
            this.hideErrorMessage();
            this.queryData(url);
        }
    }, this));

    // Event handler for clicking any of the navigation links drop downs and selecting a link option.
    this.$results.on('change', '.links', $.proxy(function (event) {
        var $e = $(event.target);
        var uri = $e.val();

        if (uri.indexOf('http') !== -1) {
            this.queryData(uri, this.linkResultsCallback, $e);
        } else {
            var $tr = $e.parents('tr:first');
            $tr.next('tr.expandedChild').remove();
            $tr.find('span.expandChild').remove();
        }
    }, this));

    // Event handler for expanding and collapsing the navigation link child results.
    this.$results.on('click', '.expandChild', function (event) {
        var $me = $(this);
        event.stopPropagation(); // We don't want the event to bubble.
        $me.parents('tr:first').next('tr:has(table)').slideToggle("fast");
        $me.toggleClass('collapsed');
    });

    // Event handler for when the filter property or navigation propety has changed.
    this.$queryBuilder.on('change', '.property, .navPropertyProperties', $.proxy(function (event) {
        var $e = $(event.target);
        var propertyId = $e.val();
        var $whereClause = $e.parent();
        var whereClauseId = $whereClause.attr('id');
        var navigationPropertiesNumber = 1 + $whereClause.children(".navPropertyProperties").length;

        // Remove all filters and input filters because the (navigation) property has changed.
        $e.nextAll().remove();
        this.queryBuilder.removeWhereFilter(whereClauseId);

        if (propertyId >= 0) {
            var entityReferringId = $e.data("referringentityid");
            var queryProperty = this.queryBuilder.getQueryPropertiesAndNavigationPropertiesFromQueryId(entityReferringId, propertyId);
            if (queryProperty.type == 'property') {
                var propertyOptions = this.queryBuilder.getFilterOptionsForProperty(entityReferringId, propertyId);

                // If the only filter of this property is an error message, then display it.
                if (propertyOptions.length == 1 && propertyOptions[0].errorMessage) {
                    $whereClause.append('<span>' + propertyOptions[0].errorMessage + '</span>');
                } else {    // If there are possible filters for this properties, display them.
                    var keys = [];
                    for (var i = 0, l = propertyOptions.length; i < l; i++) {
                        keys.push({ key: i, value: propertyOptions[i].displayName });
                    }

                    var displayThePropertyFilterInput = false;
                    for (var k = 0; k < propertyOptions.length; k++) {
                        if (propertyOptions[k].inputType != false ||
                            typeof propertyOptions[k].inputTypeOptions !== 'undefined') {

                            displayThePropertyFilterInput = true;
                            break;
                        }
                    }

                    this.addDropdown(
                        'propertyFilter',
                        keys,
                        $whereClause,
                        entityReferringId,
                        false,
                        displayThePropertyFilterInput);
                }
            } else {
                // Only allow navigation recursion to the maximum depth set in the query builder class.
                var refEntityId = this.queryBuilder.getNavigationPropertyReferringEntityId(entityReferringId, propertyId);
                var navigationOptions;
                if (navigationPropertiesNumber >= this.queryBuilder.getMaxNavigationRecursion()) {
                    navigationOptions = this.queryBuilder.getQueryPropertiesForEntity(refEntityId);
                } else {
                    navigationOptions = this.queryBuilder.getQueryPropertiesAndNavigationPropertiesForEntity(refEntityId);
                }

                // If the navigation property has nothing to display afterwards, then show a message.
                if (!navigationOptions || navigationOptions.length == 0) {
                    $whereClause.append('<span>No options to query for this navigation property</span>');
                } else {
                    this.addDropdown('navPropertyProperties', navigationOptions, $whereClause, refEntityId, false, false);
                }
            }
        }

        this.updateUrl(this.queryBuilder.getGeneratedODataQueryUrl());
    }, this));

    // Event handler for when the property filter has changed.
    this.$queryBuilder.on('change', '.propertyFilter', $.proxy(function (event) {
        var $e = $(event.target);
        // Update the propertyFilterInput or remove it if not needed.
        var parent = $e.parent();
        var whereClauseId = parent.attr('id');
        var selectedReferringEntityId = $e.data("referringentityid");
        var propertyFilterInput = parent.children('.propertyFilterInput');
        var propertyId = $e.prev().children("option:selected").val();
        var propertyFilterId = $e.children("option:selected").val();

        if (propertyFilterId >= 0) {
            var propOptions = this.queryBuilder.getFilterOptionsForProperty(selectedReferringEntityId, propertyId);

            var whereFilter = propOptions[propertyFilterId];
            var inputType = whereFilter.inputType;
            var inputTypeOptions = whereFilter.inputTypeOptions;

            if (inputType == false) {
                propertyFilterInput.remove();
                if (typeof inputTypeOptions !== 'undefined') {
                    var options = [];
                    for (var i in inputTypeOptions) {
                        options.push({ key: i, value: inputTypeOptions[i] });
                    }

                    this.addDropdown('propertyFilterInput', options, '#' + whereClauseId, selectedReferringEntityId, false, false);
                }
            } else {
                // Check if we need to remove the dropdown to add an input field.
                if (propertyFilterInput.is('select')) {
                    propertyFilterInput.remove();
                    this.addInput('propertyFilterInput', '#' + whereClauseId);
                    propertyFilterInput = parent.children('.propertyFilterInput');
                }

                propertyFilterInput.data("inputType", inputType);
            }
        }

    }, this));

    // Event handler for allowing only specific values in the input fields.
    this.$queryBuilder.on('keypress paste keyup', '.propertyFilterInput', function (event) {
        var $e = $(event.target);
        var inputType = $e.data("inputType");

        switch (inputType) {
            case 'int':
                return OData.explorer.validation.allowOnlyInts(event);
            case 'double':
                return OData.explorer.validation.allowOnlyDoubles(event);
            case 'guid':
                return OData.explorer.validation.allowOnlyGuids(event);
        }

        return true;
    });

    // Event handler for when the filter property or input has changed.
    this.$queryBuilder.on('change keyup', '.propertyFilterInput, .propertyFilter', $.proxy(function (event) {
        var $e = $(event.target);
        var parent = $e.parent();
        var id = parent.attr('id');
        var $property = parent.children('.property');
        var propertyListNames = [$property.children("option:selected").text()];
        var propertyListIds = [$property.val()];
        var propertyListReferringEntityIds = [$property.data("referringentityid")];

        parent.children('.navPropertyProperties').each(function () {
            var $thisElement = $(this);
            var selectedPropName = $thisElement.children("option:selected").text();
            propertyListNames.push(selectedPropName);
            propertyListIds.push($thisElement.val());

            var selectedReferringEntityId = $thisElement.data("referringentityid");
            propertyListReferringEntityIds.push(selectedReferringEntityId);
        });
        var propFilterId = parent.children('.propertyFilter').children("option:selected").val();
        var itemText = parent.children('.propertyFilterInput').val();

        this.queryBuilder.addOrUpdateWhereFilter(id, propertyListNames, propertyListIds, propertyListReferringEntityIds, propFilterId, itemText);
        this.updateUrl(this.queryBuilder.getGeneratedODataQueryUrl());
    }, this));
};

/// <summary>
/// Display an error message.
/// </summary>
/// <param name ="msg" type="String">The message.</param>
/// <param name ="delay" type="Integer">How long the message will be on screen. 
/// A negative numbers leaves the message forever on screen. Default: 10 secs</param>
OData.explorer.DataExplorer.prototype.showErrorMessage = function (msg, delay) {
    delay = delay || OData.explorer.constants.displayErrorMessageDuration;

    if (delay < 0) {
        this.$errorMessage.text(msg).addClass('error').show();
    } else {
        this.$errorMessage.text(msg).addClass('error').show().delay(delay).fadeOut('fast');
    }
};

/// <summary>
/// Display an error message.
/// </summary>
/// <param name ="url" type="String">The new url.</param>
OData.explorer.DataExplorer.prototype.hideErrorMessage = function () {
    this.$errorMessage.hide();
};

/// <summary>Adds a drop down select control.</summary>
/// <param name="classId">The CSS class name for the select that will be created.</param>
/// <param name="options">The array of options data for the select.</param>
/// <param name="appendTo">The element, or selector for the element, to append the select to.</param>
/// <param name="referringEntityId">The id of the entity the select refers to.</param>
/// <param name="addEmptySelect">Flag indicating if an empty first option should be added.</param>
/// <param name="addPropertyFilterInput">Flag indicating if the property filter input should be added.</param>
OData.explorer.DataExplorer.prototype.addDropdown = function (
    classId, options, appendTo, referringEntityId, addEmptySelect, addPropertyFilterInput) {
    var select = $('<select class="' + classId +
        '" data-referringentityid=' + referringEntityId + '/>');

    this.addOptions(options, select, addEmptySelect);
    select.appendTo(appendTo);

    if (addPropertyFilterInput) {
        this.addInput('propertyFilterInput', appendTo);
    }

    // Trigger change so that the code knows that it has been added.
    select.trigger('change');
};

/// <summary>Adds options to a drop down select control.</summary>
/// <param name="options">The array of options data to generate option tags with.</param>
/// <param name="select">The select element, or selector for it, to append the options to.</param>
/// <param name="addEmptySelect">Flag indicating if an empty first option should be added.</param>
OData.explorer.DataExplorer.prototype.addOptions = function (options, select, addEmptySelect) {
    if (addEmptySelect) {
        $('<option />', { value: -1, text: '-- Select --' }).appendTo(select);
    }

    $.each(options, function (index, e) {
        var $option = $('<option />', { value: e.key, text: e.value });

        if (typeof e.type !== 'undefined' && e.type == 'navigationProperty') {
            $option.addClass('navigationDropdown');
        }

        $option.appendTo(select);
    });
};

/// <summary>Adds an text input control.</summary>
/// <param name="classId">The CSS class name for the input that will be created.</param>
/// <param name="appendTo">The element, or selector for the element, to append the input to.</param>
OData.explorer.DataExplorer.prototype.addInput = function (classId, appendTo) {
    var s = $('<input type="text" class="' + classId + '"/>');
    s.appendTo(appendTo);
};

/// <summary>Updates the displayed URL.</summary>
/// <param name="url">The URL to update the display with.  Defaults to an empty string.</param>
OData.explorer.DataExplorer.prototype.updateUrl = function (url) {
    url = url || '';

    var urlToBeUpdated = this.getUrl();
    this.$queryUrl.text(url).attr('href', url);

    if (url && this.options.onUrlChange && urlToBeUpdated != url) {
        // Raise an event
        this.options.onUrlChange(url);
    }
};

/// <summary>Retrieve the displayed URL.</summary>
OData.explorer.DataExplorer.prototype.getUrl = function () {
    return this.$queryUrl.attr('href');
};

/// <summary>
/// Sets the busy status as indicated.
/// </summary>
/// <param name ="isBusy" type="Boolean">True to show busy indicator(s) or false to hide them.</param>
OData.explorer.DataExplorer.prototype.busy = function (isBusy) {
    if (isBusy) {
        this.$busy.show();
    } else {
        this.$busy.hide();
    }
};

/// <summary>
/// Handles updating the UI when the metadata model has been generated for a service endpoint.
/// </summary>
/// <param name ="error">An error message if there was an error processing the metadata.</param>
OData.explorer.DataExplorer.prototype.Reset = function (error) {
    this.$entities.val(-1);
    this.resetQuery();
    this.hideErrorMessage();

    if (error) {
        this.showErrorMessage(JSON.stringify(error), -1);
    } else {
        // set up
        this.$queryFilters.show();
        this.$entities.children('option').remove();
        this.addOptions(this.queryBuilder.getEntitiesNames(), this.$entities, true);
        this.$top.val(this.defaultTop);
        this.resetQuery();
    }
};

/// <summary>
/// Resets the query.
/// </summary>
/// <param name ="entityIndex">The index of an entity.</param>
OData.explorer.DataExplorer.prototype.resetQuery = function (entityIndex) {
    this.hideErrorMessage();
    this.$queryUrl.hide();
    this.updateUrl();
    this.$whereConditions.children('div').remove();
    this.$filtersConditions.hide();
    this.$orderByConditions.removeClass('listVisible');
    this.$selectConditions.removeClass('listVisible');
    this.$expandConditions.removeClass('listVisible');
    this.$orderByFiltersList.empty();
    this.$selectFiltersList.empty();
    this.$expandFiltersList.empty();
    this.$results.empty();

    if (this.queryBuilder) {
        this.queryBuilder.emptyWhereFilter();
        this.queryBuilder.clearOrderByProperty();
        this.queryBuilder.clearSelectColumnsProperty();
        this.queryBuilder.clearExpandProperty();
        this.queryBuilder.setTop(this.$top.val());

        entityIndex = entityIndex || this.$entities.val();
        if (entityIndex && entityIndex >= 0) {
            // Set the selected entity. 
            this.queryBuilder.setSelectedEntityId(entityIndex);
            this.updateUrl(this.queryBuilder.getGeneratedODataQueryUrl());
            this.$queryUrl.show();

            // Set up the more filter options.
            // Add the order by and select conditions (They are the same).
            var properties = this.queryBuilder.getQueryPropertiesForEntity(this.queryBuilder.getSelectedEntityId());
            for (var i in properties) {
                var property = properties[i];

                // Order by.
                var orderByHtmlId = 'orderby_' + property.key;
                var $orderByLabel = $('<label />', { 'for': orderByHtmlId, text: property.value });
                $orderByLabel.appendTo(this.$orderByFiltersList);
                $('<input />', { type: 'checkbox', id: orderByHtmlId, value: property.key }).prependTo($orderByLabel);

                // Select column.
                var selectColumnHtmlId = 'selectcolumn_' + property.key;
                var $selectColumnLabel = $('<label />', { 'for': selectColumnHtmlId, text: property.value });
                $selectColumnLabel.appendTo(this.$selectFiltersList);
                $('<input />', { type: 'checkbox', id: selectColumnHtmlId, value: property.key }).prependTo($selectColumnLabel);
            };

            var navigationProperties = this.queryBuilder.getQueryNavigationPropertiesForEntity(this.queryBuilder.getSelectedEntityId());
            for (var i in navigationProperties) {
                var navigationProperty = navigationProperties[i];

                // Expand.
                var expandHtmlId = 'expand_' + navigationProperty.key;
                var $expandLabel = $('<label />', { 'for': expandHtmlId, text: navigationProperty.value });
                $expandLabel.appendTo(this.$expandFiltersList);
                $('<input />', { type: 'checkbox', id: selectColumnHtmlId, value: navigationProperty.key }).prependTo($expandLabel);
            };

            // Show the filters.
            this.$filtersConditions.show();
        } else {
            this.updateUrl();
        }
    }
};

/// <summary>
/// Creates a new where clause for the query.
/// </summary>
OData.explorer.DataExplorer.prototype.createNewWhereQuery = function () {
    // Add a div for the first property.
    var whereClauseId = this.queryBuilder.getNextWhereId();
    var $whereClause = $('<div />', { id: whereClauseId })
        .insertBefore(this.$addCondition);
    $whereClause.append($(
        '<button />', { 'class': 'removeCondition', 'data-whereclauseid': whereClauseId, text: 'X' }));
    var selectedEntityId = this.queryBuilder.getSelectedEntityId();
    this.addDropdown(
        'property',
        this.queryBuilder.getQueryPropertiesAndNavigationPropertiesForEntity(selectedEntityId),
        $whereClause,
        this.queryBuilder.getSelectedEntityId(),
        false,
        false);
};

/// <summary>
/// Queries data from the specified URL and passes the results to the results callback handler method.
/// </summary>
/// <param name ="url">The URL to query data from.</param>
/// <param name ="callback">A callback to call with the data, the calling context will be "this".</param>
/// <param name ="context">An additional context, besides "this", to pass to the callback.</param>
OData.explorer.DataExplorer.prototype.queryData = function (url, callback, context) {
    if (this.options.onSubmit) {
        var newUrl = this.options.onSubmit(url);

        if (newUrl) {
            url = newUrl;
        } else {
            return;
        }
    }

    callback = callback || this.resultsCallback;
    var me = this;

    this.busy(true);

    // First try without jsonp.
    OData.read(
        { requestUri: url, enableJsonpCallback: false, timeoutMS: OData.explorer.constants.queryTimeout },
       // Success callback.
       function (data, request) {
           callback.call(me, data, context);
       },
       // Error callback.
       $.proxy(function (err) {
           // If it fails try with jsonp: 
           // two calls gets spawn at the same time. The goal is to hopefully to get the 
           // fullmetadata, however some services returns an error when asked for fullmetadata, and therefore we have 
           // the fallback.

           var correctAjax = 0;
           var errorsAjax = 0;

           // Error callback.
           var errorCallback = $.proxy(function (errorFinal) {
               if (errorsAjax > 0) {
                   this.showErrorMessage(JSON.stringify(errorFinal));
                   this.busy(false);
                   if (this.options.onError) {
                       this.options.onError(errorFinal, url);
                   }
               }

               errorsAjax++;
           }, this);

           // First Try
           // Set the formatQueryString so that it returns application/json;odata=fullmetadata
           OData.defaultHttpClient.formatQueryString = '$format=application/json;odata=fullmetadata;';

           OData.read(
           { requestUri: url, enableJsonpCallback: true, timeoutMS: OData.explorer.constants.queryTimeout },
           // Success callback.
           function (data, request) {
               correctAjax++;
               callback.call(me, data, context);
           },
           errorCallback);

           // Second Parallel Try
           OData.defaultHttpClient.formatQueryString = '$format=json';

           OData.read(
           { requestUri: url, enableJsonpCallback: true, timeoutMS: OData.explorer.constants.queryTimeout },
           // Success callback.
           function (data, request) {
               if (correctAjax == 0) {
                   correctAjax++;
                   callback.call(me, data, context);
               }
           },
           errorCallback);
       }, this));
};

// ------------------------------------------------------------------------------
// The following functions display the results of the query in the UI.
// ------------------------------------------------------------------------------

/// <summary>
/// The results callback handler method for when data has been loaded from a link drop down selection.
/// </summary>
/// <param name ="data">The data from the server.</param>
/// <param name ="source">
/// The source of the event, the select box that triggered the load of child navigation data.</param>
OData.explorer.DataExplorer.prototype.linkResultsCallback = function (data, source) {
    try {
        var results = this.sanitizeDataFormat(data);
        if (results.length > 0) {
            // Find or create the expand/collapse span.
            var $tr = source.parents('tr:first');
            var tableTitle = source.children('option:selected').text();
            var $td = $tr.find('td:first');
            if ($td.find('> .expandChild').size() === 0) {
                $td.prepend('<span class="expandChild" />');
            } else {
                // Try to find if this table has already been created previously and remove it.
                $tr.next().find('*[data-tabletitle="' + tableTitle + '"]').remove();
            }

            // Find or create the child data row and populate it.
            var $row = $tr.next('.expandedChild');
            var $childCell;
            if ($row.size() === 0) {
                $row = $('<tr class="expandedChild" />');
                $tr.after($row);
                var columnCount = $tr.children().size();
                $childCell = $('<td />', { colspan: columnCount });
                $row.append($childCell);
            } else {
                $childCell = $row.find('td:first');
            }

            // Add the link table before all the others for easier reading.
            $childCell.append(this.createResultsTable(results, tableTitle));

            this.hideErrorMessage();
        } else {
            this.noResults();
        }
    } catch (e) {
        this.noResults();
    } finally {
        this.busy(false);
    }
};

/// <summary>
/// Generates the display table of the specified data.
/// </summary>
/// <param name ="data">The data to generate the display from.</param>
/// <param name ="title">The title of the table.</param>
OData.explorer.DataExplorer.prototype.createResultsTable = function (data, title) {
    var me = this;
    var $table = $('<table class="defaultResultsFormatting"/>');
    if (data && data.length > 0) {
        var $thead = $('<thead />');
        $table.append($thead);
        var columnCount = 0;

        // Add the column names.
        var $headRow = $('<tr/>');
        $thead.append($headRow);
        var result = data[0];
        for (var property in result) {
            var type = typeof result[property];
            // DataJS returns the dates as objects and not as strings.
            if (type === 'string' || type === 'number' || type === 'boolean' ||
                result[property] instanceof Date || !result[property]) {
                $headRow.append($('<th />', { text: property }));
                ++columnCount;
            }
        }

        var hasLinks = false;
        var $tbody = $('<tbody />');
        $table.append($tbody);
        $.each(data, function (index, e) {
            var $bodyRow = $('<tr/>');
            $tbody.append($bodyRow);
            var expandedChildResults = null;
            var links = [];
            $.each(e, function (index, property) {
                var type = typeof property;
                if (type === 'string' || type === 'number' || type === 'boolean') {
                    $bodyRow.append($('<td />', { text: property }));
                } else if (property instanceof Date) { // DataJS returns the dates as objects and not as strings.
                    $bodyRow.append($('<td />', { text: property.toDateString() }));
                } else if (!property) {
                    $bodyRow.append('<td />');
                } else if (typeof property === 'object' && property.results && index !== '__metadata') {
                    expandedChildResults = property.results;
                } else if (property.__deferred) {
                    links.push({ key: property.__deferred.uri, value: index });
                    hasLinks = true;
                }
            });

            // Display the links only if there are some.
            if (links.length !== 0) {
                columnCount += 2;
                var $cell = $('<td />');
                $bodyRow.prepend($cell);
                me.addDropdown('links', links, $cell, '', true, false);

                // Prepend a blank cell for the expand icon.
                var $expandCell = $('<td/>');
                $bodyRow.prepend($expandCell);
                if (expandedChildResults) {
                    // Add the expand/collapse button.
                    $expandCell.append('<span class="expandChild" />');

                    // Create a new row for the child results.
                    $bodyRow = $('<tr class="expandedChild" />');
                    $table.append($bodyRow);
                    var $childCell = $('<td />', { colspan: columnCount });
                    $bodyRow.append($childCell);
                    $childCell.append(me.createResultsTable(expandedChildResults));
                }
            }
        });

        // Display the links column names only if they exist.
        if (hasLinks) {
            $headRow.prepend('<th></th><th>Links</th>');
        }

        // Add a title to the table.
        if (title) {
            var $titleRow = $('<tr />');
            $thead.prepend($titleRow);
            $titleRow.append($('<th />', { text: title, colspan: columnCount }));

            $table.attr('data-tabletitle', title);
        }
    } else {
        this.noResults();
    }

    return $table;
};

/// <summary>
/// Shows a message indicating there are no results for an attempted data load query.
/// </summary>
OData.explorer.DataExplorer.prototype.noResults = function () {
    this.showErrorMessage('No results.');
};

/// <summary>
/// The results callback handler method for when data has been loaded.
/// </summary>
/// <param name ="data">The data from the server.</param>
OData.explorer.DataExplorer.prototype.resultsCallback = function (data) {
    try {
        this.$results.empty();

        var results = this.sanitizeDataFormat(data);
        if (this.options.onResults) {
            // User custom handling.
            var formattedResults = this.options.onResults(results);
            if (formattedResults) {
                this.$results.append(formattedResults);
            }
        } else {
            // Default handling.
            if (results.length > 0) {
                this.$results.append(this.createResultsTable(results));
            } else {
                // No results.
                this.noResults();
            }
        }
    } finally {
        this.busy(false);
    }
};

/// <summary>
/// Sanitizes the format of the data that has been loaded.
/// </summary>
/// <param name ="data">The data from the server.</param>
OData.explorer.DataExplorer.prototype.sanitizeDataFormat = function (data) {
    var results = [];

    if (!data) {
        return results;
    }

    // data.results or data should be the only encoding returned by DataJS.
    if (data.results) {
        results = data.results;
    } else if (data.d) {
        results = data.d.results ? data.d.results : (Array.isArray(data.d) ? data.d : [data.d]);
    } else if (data.value) {
        results = data.value;
    } else if (!Array.isArray(data)) {
        // DataJS does not return an array if only one element is present.
        results = [data];
    } else {
        throw 'Unknown results format.';
    }

    return results;
};

// Validation namespace.
OData.explorer.validation = OData.explorer.validation || {};

/// <summary>
/// Event handler for key presses that prevents entering any key stroke which would produce an invalid integer.
/// </summary>
/// <param name ="event">The event object.</param>
OData.explorer.validation.allowOnlyInts = function (event) {
    var $element = $(event.target);
    var value = $element.val();

    // Allow only backspace and delete to support also Firefox.
    var key = event.keyCode ? event.keyCode : (event.which ? event.which : event.charCode);

    // Backspace.
    if (key == 8) {
        return true;
    }

    // Allow one - sign at the beginning.
    if (key == 45) {
        if (value.length == 0) {
            // Just allow to regularly add it.
            return true;
        } else {
            // Add it manually at the beginning of the string.
            value = value[0] == '-' ? value.substr(1) : '-' + value;
            $element.val(value);
            return false;
        }
    }

    // Ensure that it is a number and stop the keypress.
    if (key < 48 || key > 57) {
        event.preventDefault();
        return false;
    }

    return true;
};

/// <summary>
/// Event handler for key presses that prevents entering any key stroke which would produce an invalid double.
/// </summary>
/// <param name ="event">The event object.</param>
OData.explorer.validation.allowOnlyDoubles = function (event) {
    var $element = $(event.target);
    var value = $element.val();

    // Allow only backspace and delete to support also Firefox.
    var key = event.keyCode ? event.keyCode : (event.which ? event.which : event.charCode);

    // Allow only one dot.
    if (key == 46 && value.indexOf('.') == -1) {
        return true;
    }

    return OData.explorer.validation.allowOnlyInts(event);
};

/// <summary>
/// Event handler for key presses that prevents entering any key stroke which would produce an invalid GUID.
/// </summary>
/// <param name ="event">The event object.</param>
OData.explorer.validation.allowOnlyGuids = function (event) {
    var $element = $(event.target);
    var value = $element.val();
    if (value) {
        var matchValue = value.match('^(\{{0,1}([0-9a-fA-F]){8}-([0-9a-fA-F]){4}-([0-9a-fA-F]){4}-([0-9a-fA-F]){4}-([0-9a-fA-F]){12}\}{0,1})$');
        if (matchValue == null) {
            $element.addClass('wrongInput');
        } else {
            $element.removeClass('wrongInput');
        }
    }
};
