module.exports = {

    loadFeatures,
    getListFeatures,
    isFeatureActive,

};

const featureNames = [
    'EVENTS',
    'GAMIFICATION',
    'INCOME_REPORT',
    'ITEM_CATEGORIES',
    'MAP',
    'PRICE_RECOMMENDATION',
    'REFERRAL',
    'SMS',
    'SOCIAL_LOGIN',
    'TAGS',
];
let features;

async function loadFeatures() {
    // TODO: load them from db
    features = {
        GAMIFICATION: true,
        TAGS: true,
        EVENTS: true,
        SOCIAL_LOGIN: true,
        INCOME_REPORT: true,
        SMS: true,
        MAP: true,
    };

    features.PRICE_RECOMMENDATION = !!sails.config.priceRecommendationUrl;

    // create alias for some features
    _.assign(features, {
        ITEM_CATEGORIES: features.TAGS,
        REFERRAL: features.GAMIFICATION,
    });

    features = _.pick(features, featureNames);
}

async function getListFeatures() {
    await loadFeatures();
    return features;
}

async function isFeatureActive(name) {
    await loadFeatures();

    if (typeof features[name] === 'undefined') {
        throw new Error('Unknown feature');
    }

    return features[name];
}