/* global ToolsService */

/**
* Tag.js
*
* @description :: TODO: You might write a short summary of how this model works and what it represents here.
* @docs        :: http://sailsjs.org/#!documentation/models
*/

module.exports = {

    attributes: {
        name: {
            type: "string",
            required: true,
            size: 191,
            maxLength: 191
        },
        nameURLSafe: "string",
        itemCategoryIds: "array",
        validated: {
            type: "boolean",
            defaultsTo: false
        },
        priorityScore: {
            type: "integer",
            defaultsTo: 0
        },
        timesSearched: {
            type: "integer",
            defaultsTo: 0
        },
        timesSearchedSimilar: {
            type: "integer",
            defaultsTo: 0
        },
        timesAdded: {
            type: "integer",
            defaultsTo: 0
        }
    },

    getAccessFields: getAccessFields,
    postBeforeCreate: postBeforeCreate,
    postBeforeUpdate: postBeforeUpdate,

};

function getAccessFields(access) {
    var accessFields = {
        others: [
            "id",
            "name",
            "nameURLSafe",
            "itemCategoryIds",
            "validated",
            "priorityScore",
            "timesSearched",
            "timesSearchedSimilar",
            "timesAdded"
        ]
    };

    return accessFields[access];
}

function postBeforeCreate(values) {
    if (values.name) {
        values.nameURLSafe = ToolsService.getURLStringSafe(values.name);
    }
}

function postBeforeUpdate(values) {
    if (values.name) {
        values.nameURLSafe = ToolsService.getURLStringSafe(values.name);
    }
}
