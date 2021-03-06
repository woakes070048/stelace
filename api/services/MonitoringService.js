/* global Assessment, Booking, Conversation, Item, Link, MathService, PricingService, ToolsService, User */

module.exports = {

    getIncompleteBookings: getIncompleteBookings,
    getPaidBookings: getPaidBookings,
    getPreBookingsToValidate: getPreBookingsToValidate,
    getAssessmentsDueDates: getAssessmentsDueDates,
    getUnsignedAssessments: getUnsignedAssessments,
    getUsers: getUsers,
    getItems: getItems,
    getRevenue: getRevenue,
    getLinks: getLinks

};

/**
 * get uncompleted bookings
 * @param {object} args
 * @param {string} args.access
 * @param {string} args.itemMode
 */
function getIncompleteBookings(args) {
    args = args || {};

    var access = args.access || "self";

    return Promise.coroutine(function* () {
        var bookings = yield getRealBookings(args.itemMode);

        if (! bookings.length) {
            return { bookings: [] };
        }

        var assessmentsHash = yield Booking.getAssessments(bookings);
        bookings            = rejectCompleteBookings(bookings, assessmentsHash);
        var extraInfo       = yield getExtraInfo(bookings);

        return getIncompleteBookingsResult({
            bookings: bookings,
            assessmentsHash: assessmentsHash,
            users: extraInfo.users,
            items: extraInfo.items
        }, access);
    })();



    // get bookings that are paid by booker or validated by owner
    function getRealBookings(itemMode) {
        var findAttrs = {
            cancellationId: null
        };

        if (itemMode) {
            findAttrs.itemMode = itemMode;
        }

        findAttrs.or = [
            { confirmedDate: { '!': null } },
            { validatedDate: { '!': null } }
        ];

        return Booking.find(findAttrs);
    }

    function rejectCompleteBookings(bookings, assessmentsHash) {
        return _.reject(bookings, booking => {
            var hash             = assessmentsHash[booking.id];
            var inputAssessment  = hash.inputAssessment;
            var outputAssessment = hash.outputAssessment;

            return Booking.isComplete(booking, inputAssessment, outputAssessment);
        });
    }

    function getExtraInfo(bookings) {
        var usersIds = _.reduce(bookings, (memo, booking) => {
            memo.push(booking.bookerId);
            memo.push(booking.ownerId);

            return memo;
        }, []);
        usersIds = _.uniq(usersIds);

        var itemsIds = _.pluck(bookings, "itemId");

        return Promise.props({
            users: User.find({ id: usersIds }),
            items: Item.find({ id: itemsIds })
        });
    }

    function getIncompleteBookingsResult(args, access) {
        var bookings        = args.bookings;
        var assessmentsHash = args.assessmentsHash;
        var users           = args.users;
        var items           = args.items;

        var result = {};

        result.bookings = Booking.exposeAll(bookings, access);
        result.users    = User.exposeAll(users, "others"); // restrict user data access
        result.items    = Item.exposeAll(items, access);

        result.assessmentsHash = _.reduce(assessmentsHash, (memo, hash, bookingId) => {
            memo[bookingId] = {
                inputAssessment: Assessment.expose(hash.inputAssessment, access),
                outputAssessment: Assessment.expose(hash.outputAssessment, access)
            };
            return memo;
        }, {});

        return result;
    }
}

/**
 * get paid bookings
 * @param  {object}   args
 * @param  {string}   [args.fromDate]
 * @param  {string}   [args.toDate]
 * @param  {boolean}  [args.cancelled = false]
 * @param  {boolean}  [args.validated]
 * @param  {string}   [args.itemMode]
 */
function getPaidBookings(args) {
    args = args || {};

    if (typeof args.cancelled === "undefined") {
        args.cancelled = false;
    }

    return Promise
        .resolve()
        .then(() => {
            var findAttrs = {};

            if (args.itemMode) {
                findAttrs.itemMode = args.itemMode;
            }

            var periodAttrs = ToolsService.getPeriodAttrs(args.fromDate, args.toDate);

            if (periodAttrs) {
                findAttrs.confirmedDate = periodAttrs;
            }
            if (typeof args.validated !== "undefined" && ! args.validated) {
                findAttrs.validatedDate = null;
            }
            if (! args.cancelled) {
                findAttrs.cancellationId = null;
            }

            if (! periodAttrs) {
                findAttrs.confirmedDate = { '!': null };
            }
            if (args.validated) {
                findAttrs.validatedDate = { '!': null };
            }
            if (args.cancelled) {
                findAttrs.cancellationId = { '!': null };
            }

            return Booking.find(findAttrs);
        });
}

/**
 * get pre-bookings to validate
 * @param  {object}  args
 * @param  {string}  [args.fromDate]
 * @param  {string}  [args.toDate]
 * @param  {string}  [args.logger]
 * @return {Promise<Booking[]>}
 */
function getPreBookingsToValidate(args) {
    args = args || {};

    return Promise
        .resolve()
        .then(() => {
            var findAttrs = {
                cancellationId: null,
                confirmedDate: null,
                validatedDate: null
            };

            var periodAttrs = ToolsService.getPeriodAttrs(args.fromDate, args.toDate);
            if (periodAttrs) {
                findAttrs.createdDate = periodAttrs;
            }

            return Booking.find(findAttrs);
        })
        .then(bookings => {
            return [
                bookings,
                Conversation.find({ bookingId: _.pluck(bookings, "id") })
            ];
        })
        .spread((bookings, conversations) => {
            var indexedConversations = _.indexBy(conversations, "bookingId");

            bookings = _.filter(bookings, booking => {
                var conversation = indexedConversations[booking.id];

                if (! conversation) {
                    return false;
                }

                if (conversation.bookingStatus !== "pre-booking" && args.logger) {
                    var error = new Error("Conversation should have a status 'pre-booking'");
                    error.conversationId = conversation.id;
                    args.logger.warn({ err: error });
                }

                return !! conversation;
            });

            return bookings;
        });
}

function getAssessmentsDueDates(assessments, logger) {
    return Promise
        .resolve()
        .then(() => {
            var bookingsIds = _.reduce(assessments, (memo, assessment) => {
                // only one should be defined for a given assessment
                var bookingId = assessment.startBookingId || assessment.endBookingId;

                if (! bookingId) {
                    var error = new Error("No booking is associated with assessment");
                    error.assessmentId = assessment.id;
                    logger.error({ err: error });
                }

                memo.push(bookingId);
                return memo;
            }, []);

            return [
                assessments,
                Booking.find({ id: bookingsIds })
            ];
        })
        .spread((assessments, bookings) => {
            var indexedBookings = _.indexBy(bookings, "id");

            var config = _.reduce(assessments, (memo, assessment) => {
                var booking = indexedBookings[assessment.startBookingId || assessment.endBookingId];
                if (! booking) {
                    var error = new Error("Assessment associated booking not found");
                    error.assessmentId = assessment.id;
                    logger.error({ err: error });
                }

                var type;
                if (assessment.startBookingId) {
                    type = "start";
                } else { // assessment.endBookingId
                    type = "end";
                }

                var dueDate = Booking.getDueDate(booking, type);

                memo[assessment.id] = {
                    assessment: assessment,
                    booking: booking,
                    dueDate: dueDate
                };

                return memo;
            }, {});

            return config;
        });
}

function getUnsignedAssessments() {
    return Promise
        .resolve()
        .then(() => {
            var findAttrs = {
                signedDate: null,
                cancellationId: null
            };

            return Assessment.find(findAttrs);
        })
        .then(assessments => {
            return Assessment.filterConversationAssessments(assessments);
        });
}

/**
 * get users
 * @param  {object} args
 * @param  {string} [args.fromDate]
 * @param  {string} [args.toDate]
 */
function getUsers(args) {
    args = args || {};

    return Promise
        .resolve()
        .then(() => {
            var findAttrs = {};

            var periodAttrs = ToolsService.getPeriodAttrs(args.fromDate, args.toDate);
            if (periodAttrs) {
                findAttrs.createdDate = periodAttrs;
            }

            return User.find(findAttrs);
        });
}

/**
 * get items
 * @param  {object}  args
 * @param  {string}  [args.fromDate]
 * @param  {string}  [args.toDate]
 * @param  {boolean} [args.validated]
 */
function getItems(args) {
    args = args || {};

    return Promise
        .resolve()
        .then(() => {
            var findAttrs = {};

            if (typeof args.validated !== "undefined") {
                findAttrs.validated = !! args.validated;
            }

            var periodAttrs = ToolsService.getPeriodAttrs(args.fromDate, args.toDate);
            if (periodAttrs) {
                findAttrs.createdDate = periodAttrs;
            }

            return Item.find(findAttrs);
        });
}

/**
 * get revenue
 * @param  {object} args
 * @param  {string} [args.fromDate]
 * @param  {string} [args.toDate]
 */
function getRevenue(args) {
    args = args || {};

    return Promise
        .resolve()
        .then(() => {
            return Booking.find({
                cancellationId: null,
                confirmedDate: { '!': null },
                validatedDate: { '!': null }
            });
        })
        .then(bookings => {
            bookings = _.filter(bookings, booking => {
                var launchDate = Booking.getLaunchDate(booking);

                if (args.fromDate && launchDate < args.fromDate) {
                    return false;
                }
                if (args.toDate && args.toDate < launchDate) {
                    return false;
                }

                return true;
            });

            var revenue = _.reduce(bookings, (memo, booking) => {
                var isPeer2Peer = (booking.itemMode === "classic" && booking.ownerId !== 1);

                var priceResult = PricingService.getPriceAfterRebateAndFees({ booking: booking });

                if (isPeer2Peer) {
                    memo.peer2peer += priceResult.ownerNetIncome;
                } else {
                    memo.booking += priceResult.ownerNetIncome;
                }

                memo.fees += (priceResult.ownerFees + priceResult.takerFees);

                return memo;
            }, {
                peer2peer: 0,
                booking: 0,
                fees: 0
            });

            _.forEach(["peer2peer", "booking", "fees"], field => {
                revenue[field] = MathService.roundDecimal(revenue[field], 2);
            });

            return revenue;
        });
}

/**
 * get links
 * @param  {object}  args
 * @param  {string}  [args.fromDate]
 * @param  {string}  [args.toDate]
 * @param  {boolean} [args.validated]
 * @param  {string}  [args.source]
 */
function getLinks(args) {
    args = args || {};

    return Promise
        .resolve()
        .then(() => {
            var findAttrs = {};

            if (typeof args.validated !== "undefined") {
                findAttrs.validated = !! args.validated;
            }

            if (args.source) {
                findAttrs.source = args.source;
            }

            var periodAttrs = ToolsService.getPeriodAttrs(args.fromDate, args.toDate);
            if (periodAttrs) {
                findAttrs.createdDate = periodAttrs;
            }

            return Link.find(findAttrs);
        });
}
