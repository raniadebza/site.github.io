/* Rania Debza — comportements du site
   - premier chargement (une fois par visite)
   - page Works : carrousel, compteur, changement d'année, vue agrandie
   Règle générale : une action faite au clavier ne déclenche jamais d'animation. */

(function () {
    'use strict';

    var root = document.documentElement;
    root.classList.add('js');

    var EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Premier chargement : joué une seule fois par visite.
    try {
        if (!window.sessionStorage.getItem('rd-intro')) {
            window.sessionStorage.setItem('rd-intro', '1');
            root.classList.add('intro');
            window.addEventListener('load', function () {
                window.setTimeout(endIntro, 1000);
            });
        }
    } catch (error) {
        // Stockage indisponible : pas d'animation d'arrivée, le site reste utilisable.
    }

    function endIntro() {
        root.classList.remove('intro');
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function setDisabled(button, disabled) {
        if (disabled) {
            button.setAttribute('aria-disabled', 'true');
        } else {
            button.removeAttribute('aria-disabled');
        }
    }

    function isDisabled(button) {
        return button.getAttribute('aria-disabled') === 'true';
    }

    // Un clic déclenché au clavier (Entrée, Espace) a un compteur de clics à 0.
    function fromPointer(event) {
        return event.detail > 0;
    }

    /* ---------------------------------------------------------------------
       Carrousel d'une année
       --------------------------------------------------------------------- */

    function createCarousel(section, onOpen) {
        var track = section.querySelector('.track');
        var items = Array.prototype.slice.call(track.children);
        // On fait glisser le contenu de chaque <li>, jamais le <li> lui-même :
        // le <li> est le point d'aimantation du défilement et ne doit pas bouger.
        var movers = items.map(function (item) {
            return item.firstElementChild || item;
        });
        var prev = section.querySelector('.arrow-prev');
        var next = section.querySelector('.arrow-next');
        var counter = section.querySelector('.counter');
        var slide = [];
        var ticking = false;

        var carousel = {
            section: section,
            year: section.getAttribute('data-year'),
            items: items,
            index: 0,
            go: go
        };

        // Une seule œuvre : ni flèches ni compteur.
        if (items.length < 2) {
            prev.hidden = true;
            next.hidden = true;
            counter.hidden = true;
        }

        // Espace de fin pour que la dernière toile puisse s'aligner à gauche.
        function measure() {
            var last = items[items.length - 1];
            if (!last || !track.clientWidth) {
                return;
            }
            var gap = parseFloat(window.getComputedStyle(track).columnGap) || 0;
            var tail = Math.max(0, track.clientWidth - last.offsetWidth - gap);
            track.style.setProperty('--tail', tail + 'px');
        }

        function update() {
            var position = track.scrollLeft;
            var best = 0;
            var bestDistance = Infinity;
            items.forEach(function (item, i) {
                var distance = Math.abs(item.offsetLeft - position);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = i;
                }
            });
            carousel.index = best;
            counter.textContent = (best + 1) + ' / ' + items.length;
            setDisabled(prev, best === 0);
            setDisabled(next, best === items.length - 1);
        }

        // Décalage visuel en cours si un glissement est encore en train de jouer.
        function currentOffset() {
            if (!slide.length || !movers.length) {
                return 0;
            }
            var transform = window.getComputedStyle(movers[0]).transform;
            if (!transform || transform === 'none') {
                return 0;
            }
            return new DOMMatrixReadOnly(transform).m41;
        }

        function stopSlide() {
            slide.forEach(function (animation) {
                animation.cancel();
            });
            slide = [];
        }

        // Le défilement saute tout de suite à la bonne toile (le compteur suit),
        // puis les toiles glissent visuellement jusqu'à leur place : transform seul.
        function go(index, animate) {
            index = clamp(index, 0, items.length - 1);
            var visualFrom = track.scrollLeft - currentOffset();
            stopSlide();
            track.scrollLeft = items[index].offsetLeft;
            update();

            var delta = track.scrollLeft - visualFrom;
            if (!animate || !delta || typeof track.animate !== 'function') {
                return;
            }

            if (reducedMotion.matches) {
                slide = [track.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease' })];
            } else {
                slide = movers.map(function (mover) {
                    return mover.animate(
                        [{ transform: 'translateX(' + delta + 'px)' }, { transform: 'translateX(0)' }],
                        { duration: 350, easing: EASE_IN_OUT }
                    );
                });
            }

            var running = slide;
            running[running.length - 1].onfinish = function () {
                if (slide === running) {
                    slide = [];
                }
            };
        }

        track.addEventListener('scroll', function () {
            if (ticking) {
                return;
            }
            ticking = true;
            window.requestAnimationFrame(function () {
                ticking = false;
                update();
            });
        }, { passive: true });

        prev.addEventListener('click', function (event) {
            if (!isDisabled(prev)) {
                go(carousel.index - 1, fromPointer(event));
            }
        });

        next.addEventListener('click', function (event) {
            if (!isDisabled(next)) {
                go(carousel.index + 1, fromPointer(event));
            }
        });

        track.addEventListener('click', function (event) {
            var button = event.target.closest('.artwork-open');
            if (!button) {
                return;
            }
            var index = items.indexOf(button.closest('.artwork'));
            if (index > -1) {
                onOpen(carousel, index, fromPointer(event));
            }
        });

        if ('ResizeObserver' in window) {
            var observer = new ResizeObserver(function () {
                measure();
                update();
            });
            observer.observe(track);
            if (items.length) {
                observer.observe(items[items.length - 1]);
            }
        } else {
            window.addEventListener('resize', measure);
            window.addEventListener('load', measure);
        }

        measure();
        update();
        return carousel;
    }

    /* ---------------------------------------------------------------------
       Vue agrandie
       --------------------------------------------------------------------- */

    function createLightbox() {
        var dialog = document.querySelector('.lightbox');
        if (!dialog || typeof dialog.showModal !== 'function') {
            return null;
        }

        var image = dialog.querySelector('.lightbox-image');
        var title = dialog.querySelector('.title');
        var details = dialog.querySelector('.details');
        var counter = dialog.querySelector('.counter');
        var prev = dialog.querySelector('.arrow-prev');
        var next = dialog.querySelector('.arrow-next');
        var closeButton = dialog.querySelector('.lightbox-close');
        var carousel = null;
        var index = 0;
        var closeTimer = 0;

        function render() {
            var item = carousel.items[index];
            var source = item.querySelector('img');
            var itemTitle = item.querySelector('.title');
            var itemDetails = item.querySelector('.details');
            var total = carousel.items.length;

            image.src = source.currentSrc || source.src;
            image.alt = source.alt;
            title.textContent = itemTitle ? itemTitle.textContent : '';
            details.textContent = itemDetails ? itemDetails.textContent : '';
            counter.textContent = (index + 1) + ' / ' + total;

            var single = total < 2;
            prev.hidden = single;
            next.hidden = single;
            counter.hidden = single;
            setDisabled(prev, index === 0);
            setDisabled(next, index === total - 1);
        }

        function open(fromCarousel, at, animate) {
            window.clearTimeout(closeTimer);
            carousel = fromCarousel;
            index = at;
            render();
            dialog.classList.remove('is-closing');
            dialog.classList.toggle('is-instant', !animate);
            if (!dialog.open) {
                dialog.showModal();
            }
            void dialog.offsetWidth; // l'état de départ est pris en compte avant l'ouverture
            dialog.classList.add('is-open');
        }

        function close(animate) {
            if (!dialog.open) {
                return;
            }
            window.clearTimeout(closeTimer);
            if (animate) {
                dialog.classList.remove('is-instant', 'is-open');
                dialog.classList.add('is-closing');
                closeTimer = window.setTimeout(function () {
                    dialog.close();
                }, reducedMotion.matches ? 200 : 180);
            } else {
                dialog.close();
            }
        }

        function step(direction) {
            if (!carousel) {
                return;
            }
            var target = clamp(index + direction, 0, carousel.items.length - 1);
            if (target !== index) {
                index = target;
                render();
            }
        }

        // Fermeture (bouton, Échap) : le carrousel se replace sur la toile consultée.
        dialog.addEventListener('close', function () {
            window.clearTimeout(closeTimer);
            dialog.classList.remove('is-open', 'is-closing', 'is-instant');
            if (carousel) {
                carousel.go(index, false);
                var trigger = carousel.items[index].querySelector('.artwork-open');
                if (trigger) {
                    trigger.focus({ preventScroll: true });
                }
            }
        });

        closeButton.addEventListener('click', function (event) {
            close(fromPointer(event));
        });

        prev.addEventListener('click', function () {
            if (!isDisabled(prev)) {
                step(-1);
            }
        });

        next.addEventListener('click', function () {
            if (!isDisabled(next)) {
                step(1);
            }
        });

        return {
            open: open,
            step: step,
            isOpen: function () {
                return dialog.open;
            }
        };
    }

    /* ---------------------------------------------------------------------
       Page Works : années, clavier
       --------------------------------------------------------------------- */

    function initWorks() {
        var sections = Array.prototype.slice.call(document.querySelectorAll('.year'));
        if (!sections.length) {
            return;
        }

        var years = sections.map(function (section) {
            return section.getAttribute('data-year');
        });
        var yearLinks = Array.prototype.slice.call(document.querySelectorAll('.nav a[data-year]'));
        var timer = 0;

        function yearFromUrl() {
            var year = window.location.hash.replace('#', '');
            return years.indexOf(year) > -1 ? year : years[0];
        }

        function markNav(year) {
            yearLinks.forEach(function (link) {
                if (link.getAttribute('data-year') === year) {
                    link.setAttribute('aria-current', 'page');
                } else {
                    link.removeAttribute('aria-current');
                }
            });
        }

        // L'année de départ est posée avant toute mesure : rien ne s'anime au chargement.
        var initialYear = yearFromUrl();
        markNav(initialYear);
        sections[years.indexOf(initialYear)].classList.add('is-active');

        var lightbox = createLightbox();
        var carousels = sections.map(function (section) {
            return createCarousel(section, function (carousel, index, animate) {
                if (lightbox) {
                    lightbox.open(carousel, index, animate);
                }
            });
        });

        function find(year) {
            return carousels[years.indexOf(year)] || null;
        }

        var shown = find(initialYear);

        function show(year, animate) {
            var target = find(year);
            if (!target) {
                return;
            }
            markNav(year);
            window.clearTimeout(timer);
            if (shown) {
                shown.section.classList.remove('is-leaving');
            }
            if (target === shown) {
                return;
            }
            if (shown) {
                endIntro(); // un changement d'année interrompt l'arrivée
            }

            function swap() {
                if (shown) {
                    shown.section.classList.remove('is-active', 'is-leaving', 'is-entering');
                }
                shown = target;
                target.section.classList.add('is-active');
                target.go(0, false);
                if (animate) {
                    target.section.classList.add('is-entering');
                    timer = window.setTimeout(function () {
                        target.section.classList.remove('is-entering');
                    }, 400);
                }
            }

            if (animate && shown) {
                shown.section.classList.add('is-leaving');
                timer = window.setTimeout(swap, reducedMotion.matches ? 200 : 150);
            } else {
                swap();
            }
        }

        yearLinks.forEach(function (link) {
            link.addEventListener('click', function (event) {
                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
                    return; // ouverture dans un nouvel onglet, etc.
                }
                event.preventDefault();
                var year = link.getAttribute('data-year');
                if (window.location.hash !== '#' + year) {
                    window.history.pushState(null, '', '#' + year);
                }
                show(year, fromPointer(event));
            });
        });

        // Précédent / suivant du navigateur.
        window.addEventListener('popstate', function () {
            show(yearFromUrl(), false);
        });

        // Flèches du clavier : passage direct, sans glissement.
        document.addEventListener('keydown', function (event) {
            if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
                return;
            }
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
                return;
            }
            var direction = event.key === 'ArrowRight' ? 1 : -1;
            if (lightbox && lightbox.isOpen()) {
                lightbox.step(direction);
            } else if (shown) {
                shown.go(shown.index + direction, false);
            } else {
                return;
            }
            event.preventDefault();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWorks);
    } else {
        initWorks();
    }
})();
