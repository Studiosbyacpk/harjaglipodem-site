/*
 * harjaglipödem.se — progressive enhancement only. Every piece of content is
 * in the HTML; this adds the one-question-at-a-time symptom check, the
 * switchers and the reveal of each reply.
 *
 * Nothing the visitor answers is stored: not in localStorage, not in cookies,
 * not sent anywhere, unless she asks for the result by email and consents.
 */
(function () {
  'use strict';

  // Tells the inline fallback in <head> that the script did run, and puts the
  // class back if that fallback already removed it on a slow connection.
  window.__lipReady = true;
  document.documentElement.classList.add('js');

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------- symptom check */

  var check = document.getElementById('symtomkollen');
  if (check) initCheck(check);

  function initCheck(form) {
    var steps = Array.prototype.slice.call(form.querySelectorAll('.check-q'));
    var total = steps.length;
    var countEl = form.querySelector('[data-check-count]');
    var rule = form.querySelector('[data-check-rule]');
    var back = form.querySelector('[data-check-back]');
    var result = form.querySelector('[data-check-result]');
    var next = form.querySelector('[data-check-next]');
    var current = 0;
    var advancing = null;
    // Arrow keys change a radio group's value. Advancing on that would move a
    // keyboard user on before she has chosen, so those changes wait for Next.
    var byKeyboard = false;

    function show(i, focus) {
      current = i;
      steps.forEach(function (s, n) {
        s.classList.toggle('is-current', n === i);
      });
      countEl.textContent = 'Fråga ' + (i + 1) + ' av ' + total;
      rule.style.transform = 'scaleX(' + i / total + ')';
      back.hidden = i === 0;
      // An already answered question (after going back) needs a way forward:
      // clicking the checked answer again fires no change event.
      next.hidden = !steps[i].querySelector('input:checked');
      if (focus) {
        var checked = steps[i].querySelector('input:checked') || steps[i].querySelector('input');
        if (checked) checked.focus({ preventScroll: true });
      }
    }

    function answers() {
      return steps.map(function (s) {
        var c = s.querySelector('input:checked');
        return {
          sign: s.getAttribute('data-sign'),
          question: s.querySelector('legend').textContent.trim(),
          value: c ? Number(c.value) : null,
          label: c ? c.nextElementSibling.textContent.trim() : null,
        };
      });
    }

    /*
     * Three levels from how many recognised signs the answers match. The
     * wording reports what the answers match, never what the person has.
     */
    function level(score) {
      var max = total * 2;
      if (score >= max * 0.66) {
        return {
          key: 'manga',
          title: 'Dina svar stämmer med flera av de vanliga tecknen på lipödem.',
          text: 'Det betyder inte att du har lipödem, men det är skäl nog att låta en läkare undersöka dig. Ta gärna med dig svaren till besöket.',
        };
      }
      if (score >= max * 0.33) {
        return {
          key: 'nagra',
          title: 'Dina svar stämmer med några av de vanliga tecknen på lipödem.',
          text: 'Besvären kan ha flera orsaker. En läkare kan undersöka dig och reda ut vad de beror på.',
        };
      }
      return {
        key: 'fa',
        title: 'Dina svar stämmer med få av de vanliga tecknen på lipödem.',
        text: 'Om du ändå har besvär som påverkar din vardag är det värt att låta en läkare titta på dem.',
      };
    }

    function finish() {
      var a = answers();
      var score = a.reduce(function (sum, x) { return sum + (x.value || 0); }, 0);
      var lvl = level(score);
      form.setAttribute('data-done', lvl.key);
      form.querySelector('[data-result-title]').textContent = lvl.title;
      form.querySelector('[data-result-text]').textContent = lvl.text;

      var list = form.querySelector('[data-result-signs]');
      list.textContent = '';
      var yes = a.filter(function (x) { return x.value === 2; });
      yes.forEach(function (x) {
        var li = document.createElement('li');
        li.textContent = x.sign;
        list.appendChild(li);
      });
      form.querySelector('[data-result-signs-wrap]').hidden = yes.length === 0;

      countEl.textContent = 'Ditt resultat';
      rule.style.transform = 'scaleX(1)';
      result.hidden = false;
      form.querySelector('[data-result-title]').focus({ preventScroll: true });
      if (result.getBoundingClientRect().top < 0) result.scrollIntoView({ block: 'start' });
    }

    function advance() {
      if (current < total - 1) show(current + 1, true);
      else finish();
    }

    form.addEventListener('keydown', function (e) {
      if (!e.target.matches || !e.target.matches('.check-q input[type="radio"]')) return;
      if (e.key.indexOf('Arrow') === 0) byKeyboard = true;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (steps[current].querySelector('input:checked')) advance();
      }
    });

    form.addEventListener('pointerdown', function () { byKeyboard = false; });

    next.addEventListener('click', advance);

    form.addEventListener('change', function (e) {
      var input = e.target;
      if (!input.matches || !input.matches('.check-q input[type="radio"]')) return;
      if (byKeyboard) {
        next.hidden = false;
        return;
      }
      // A short beat so the chosen answer is seen before the next question.
      window.clearTimeout(advancing);
      advancing = window.setTimeout(advance, reduceMotion ? 0 : 220);
    });

    back.addEventListener('click', function () {
      window.clearTimeout(advancing);
      if (current > 0) show(current - 1, true);
    });

    form.querySelector('[data-check-restart]').addEventListener('click', function () {
      form.reset();
      form.removeAttribute('data-done');
      result.hidden = true;
      resetMail();
      show(0, true);
    });

    form.addEventListener('submit', function (e) { e.preventDefault(); });

    /* ---- email the result: one email, nothing stored ---- */

    var mail = form.querySelector('[data-mail]');
    var mailOpen = form.querySelector('[data-mail-open]');
    var mailSend = form.querySelector('[data-mail-send]');
    var mailError = form.querySelector('[data-mail-error]');
    var mailSent = form.querySelector('[data-mail-sent]');
    var address = form.querySelector('#mail-address');
    var consent = form.querySelector('#mail-consent');

    function resetMail() {
      mail.hidden = true;
      mailOpen.hidden = false;
      mailError.hidden = true;
      mailSent.hidden = true;
      mailSend.hidden = false;
      mailSend.disabled = false;
      address.value = '';
      consent.checked = false;
    }

    function fail(message) {
      mailError.textContent = message;
      mailError.hidden = false;
      address.setAttribute('aria-invalid', 'true');
    }

    address.addEventListener('input', function () { address.removeAttribute('aria-invalid'); });
    address.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        mailSend.click();
      }
    });

    mailOpen.addEventListener('click', function () {
      mail.hidden = false;
      mailOpen.hidden = true;
      address.focus();
    });

    mailSend.addEventListener('click', function () {
      mailError.hidden = true;
      address.removeAttribute('aria-invalid');
      var to = address.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        fail('Skriv en giltig e-postadress, till exempel namn@exempel.se.');
        address.focus();
        return;
      }
      if (!consent.checked) {
        fail('Kryssa i rutan för att samtycka till att vi skickar resultatet.');
        consent.focus();
        return;
      }

      var a = answers();
      var score = a.reduce(function (sum, x) { return sum + (x.value || 0); }, 0);
      var payload = {
        email: to,
        consent: true,
        // Values only (2 Ja, 1 Delvis, 0 Nej), in question order. The function
        // holds the question texts, so no free text can be mailed through it.
        answers: a.map(function (x) { return x.value; }),
      };

      var endpoint = form.getAttribute('data-endpoint');
      mailSend.disabled = true;

      function done(note) {
        mailSend.hidden = true;
        mailSent.textContent = note;
        mailSent.hidden = false;
        address.value = '';
      }

      if (!endpoint) {
        // No function configured yet: only allowed to pretend on a local preview.
        if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || location.protocol === 'file:') {
          done('Förhandsvisning: inget mejl skickades. Här bekräftas att resultatet är på väg.');
        } else {
          mailSend.disabled = false;
          fail('Det går inte att skicka mejl just nu. Skriv gärna ut sidan eller boka en konsultation direkt.');
        }
        return;
      }

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          if (!r.ok) throw new Error('status ' + r.status);
          done('Resultatet är skickat till ' + to + '. Vi har inte sparat dina svar eller din adress.');
        })
        .catch(function () {
          mailSend.disabled = false;
          fail('Mejlet kunde inte skickas. Kontrollera adressen och försök igen.');
        });
    });

    show(0, false);
  }

  /* ------------------------------------------------------------ switchers */

  Array.prototype.forEach.call(document.querySelectorAll('[data-switch]'), function (group) {
    var buttons = group.querySelectorAll('.seg button');
    var panels = group.querySelectorAll('[data-panel]');
    function select(id) {
      Array.prototype.forEach.call(buttons, function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-target') === id));
      });
      Array.prototype.forEach.call(panels, function (p) {
        p.hidden = p.getAttribute('data-panel') !== id;
      });
    }
    Array.prototype.forEach.call(buttons, function (b) {
      b.addEventListener('click', function () { select(b.getAttribute('data-target')); });
    });
    select(buttons[0].getAttribute('data-target'));
  });

  /* ---------------------------------------------------------------- types */

  var types = document.querySelector('[data-types]');
  if (types) {
    var typeButtons = types.querySelectorAll('button[data-zones]');
    var zones = types.querySelectorAll('.zone');
    var pick = function (button) {
      var on = button.getAttribute('data-zones').split(' ');
      Array.prototype.forEach.call(typeButtons, function (b) {
        b.setAttribute('aria-pressed', String(b === button));
      });
      Array.prototype.forEach.call(zones, function (z) {
        z.classList.toggle('is-on', on.indexOf(z.getAttribute('data-zone')) !== -1);
      });
    };
    Array.prototype.forEach.call(typeButtons, function (b) {
      b.addEventListener('click', function () { pick(b); });
    });
    pick(typeButtons[0]);
  }

  /* -------------------------------------------------------------- compare */

  var compare = document.querySelector('[data-compare]');
  if (compare) {
    var compareButtons = compare.querySelectorAll('button[data-col]');
    Array.prototype.forEach.call(compareButtons, function (b) {
      b.addEventListener('click', function () {
        compare.setAttribute('data-show', b.getAttribute('data-col'));
        Array.prototype.forEach.call(compareButtons, function (x) {
          x.setAttribute('aria-pressed', String(x === b));
        });
      });
    });
  }

  /* -------------------------------------------------------------- reveals */

  var turns = document.querySelectorAll('.turn:not(.turn-first), .close');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(turns, function (t) { t.classList.add('is-seen'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-seen');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    Array.prototype.forEach.call(turns, function (t) { io.observe(t); });
  }
})();
