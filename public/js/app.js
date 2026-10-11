// Turns the plain code input into six boxes. Without this script the input still works as a normal text field.
(function () {
	'use strict';

	function enhance(field) {
		var input = field.querySelector('input');
		var boxes = field.querySelectorAll('.code-box');
		if (!input || boxes.length === 0) {
			return;
		}

		// Codes are hex; the letter O is a common typo for zero (the server maps it too).
		function clean(value) {
			return value.toUpperCase().replace(/O/g, '0').replace(/[^0-9A-F]/g, '').slice(0, boxes.length);
		}

		function caret() {
			return input.selectionStart === null ? input.value.length : input.selectionStart;
		}

		function render() {
			var value = input.value;
			var focused = document.activeElement === input;
			var active = Math.min(caret(), boxes.length - 1);
			for (var i = 0; i < boxes.length; i++) {
				boxes[i].textContent = value.charAt(i);
				boxes[i].classList.toggle('filled', i < value.length);
				boxes[i].classList.toggle('active', focused && i === active);
			}
		}

		// Selects the character in a box, so typing replaces it; past the last character, puts the caret at the end.
		function selectBox(index) {
			var length = input.value.length;
			index = Math.max(0, Math.min(index, length));
			if (index < length) {
				input.setSelectionRange(index, index + 1);
			} else {
				input.setSelectionRange(length, length);
			}
			render();
		}

		// The input lies invisible over the boxes: find the box under the pointer (a gap counts for the next box).
		function boxAt(x) {
			for (var i = 0; i < boxes.length - 1; i++) {
				if (x < boxes[i].getBoundingClientRect().right) {
					return i;
				}
			}
			return boxes.length - 1;
		}

		input.addEventListener('input', function (event) {
			var value = input.value;
			var position = clean(value.slice(0, caret())).length;
			var cleaned = clean(value);
			if (cleaned !== value) {
				input.value = cleaned;
			}
			input.setSelectionRange(position, position);
			// Typing over a full code replaces one box after another, like separate boxes would.
			var typed = !event.inputType || event.inputType.indexOf('insert') === 0;
			if (typed && cleaned.length === boxes.length && position < cleaned.length) {
				selectBox(position);
			} else {
				render();
			}
		});
		input.addEventListener('click', function (event) {
			selectBox(boxAt(event.clientX));
		});
		input.addEventListener('keydown', function (event) {
			if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
				event.preventDefault();
				selectBox(caret() + (event.key === 'ArrowLeft' ? -1 : 1));
			}
		});
		input.addEventListener('focus', function () {
			// Focus from the keyboard or autofocus starts at the end; a click then picks its own box.
			selectBox(input.value.length);
		});
		input.addEventListener('blur', render);
		input.addEventListener('keyup', render);
		document.addEventListener('selectionchange', function () {
			if (document.activeElement === input) {
				render();
			}
		});
		input.value = clean(input.value);
		field.classList.add('enhanced');
		render();
	}

	document.querySelectorAll('.code-field').forEach(enhance);
})();
