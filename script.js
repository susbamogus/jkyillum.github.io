// ==UserScript==
// @name         Torn OC 2.0 CPR Role Recommender (T5 & T6 update)
// @namespace    http://tampermonkey.net/
// @version      1.6.2
// @author       JKYIllum
// @description  This script recommends OC roles based on your CPR and Role Weights, and warns you for high weight roles with low CPR.
// @match        https://www.torn.com/factions.php*
// @run-at       document-end
// @grant        none
// @updateURL    https://raw.githubusercontent.com/susbamogus/jkyillum.github.io/refs/heads/main/script.user.js
// @downloadURL  https://raw.githubusercontent.com/susbamogus/jkyillum.github.io/refs/heads/main/script.user.js
// @license      GPL-3.0

// ==/UserScript==

(function () {
    'use strict';

    const CRIME_CONFIG = {
        'Break the Bank': {
            redThreshold: 60,
            minRecommend: 60,
            roles: ['Muscle #3', 'Thief #2', 'Muscle #1', 'Robber', 'Muscle #2', 'Thief #1']
        },
        'Blast from the Past': {
            redThreshold: 65,
            minRecommend: 65,
            roles: ['Muscle', 'Engineer', 'Bomber', 'Hacker', 'Picklock #1', 'Picklock #2']
        },
        'Clinical Precision': {
            redThreshold: 60,
            minRecommend: 60,
            roles: ['Imitator', 'Cleaner', 'Cat Burglar', 'Assassin']
        },
        'Honey Trap': {
            redThreshold: 60,
            minRecommend: 60,
            roles: ['Muscle #2', 'Muscle #1', 'Enforcer']
        },
        'Bidding War': {
            redThreshold: 60,
            minRecommend: 60,
            roles: ['Robber #3', 'Robber #2', 'Bomber #2', 'Driver', 'Bomber #1', 'Robber #1']
        },
        'Sneaky Git Grab': {
            redThreshold: 60,
            minRecommend: 60,
            roles: ['Pickpocket', 'Imitator', 'Techie', 'Hacker']
        },
        'Leave No Trace': {
            redThreshold: 60,
            minRecommend: 60,
            roles: ['Imitator', 'Negotiator', 'Techie']
        },
        'Counter Offer': {
            redThreshold: 60,
            minRecommend: 60,
            roles: ['Robber', 'Engineer', 'Picklock', 'Hacker', 'Looter']
        },
        'No Reserve': {
            redThreshold: 60,
            minRecommend: 60,
            roles: ['Techie', 'Engineer', 'Car Thief']
        },
        'Guardian Angels': {
            redThreshold: 60,
            minRecommend: 60,
            roles: ['Hustler', 'Engineer', 'Enforcer']
        }
    };

    const ROLE_WEIGHTS = {
        'Break the Bank': {
            'Muscle #3': 31.7, 'Thief #2': 29.1, 'Muscle #1': 13.5,
            'Robber': 12.7, 'Muscle #2': 10.1, 'Thief #1': 2.9
        },
        'Blast from the Past': {
            'Muscle': 34.6, 'Engineer': 24.0, 'Bomber': 15.6,
            'Hacker': 12.1, 'Picklock #1': 10.8, 'Picklock #2': 2.9
        },
        'Clinical Precision': {
            'Imitator': 43.3, 'Cleaner': 21.7, 'Cat Burglar': 18.9, 'Assassin': 16.1
        },
        'Honey Trap': {
            'Muscle #2': 42, 'Muscle #1': 31, 'Enforcer': 27
        },
        'Bidding War': {
            'Robber #3': 32, 'Robber #2': 22, 'Bomber #2': 18,
            'Driver': 13, 'Bomber #1': 8, 'Robber #1': 7
        },
        'Sneaky Git Grab': {
            'Pickpocket': 51, 'Imitator': 18, 'Techie': 17, 'Hacker': 14
        },
        'Leave No Trace': {
            'Imitator': 37, 'Negotiator': 34, 'Techie': 29
        },
        'Counter Offer': {
            'Robber': 36, 'Engineer': 28, 'Picklock': 17,
            'Hacker': 12, 'Looter': 7
        },
        'No Reserve': {
            'Techie': 38, 'Engineer': 31, 'Car Thief': 31
        },
        'Guardian Angels': {
            'Hustler': 42, 'Engineer': 31, 'Enforcer': 27
        }
    };
    let isProcessing = false;
    let debounceTimer = null;

    function parseCPR(text) {
        if (!text) return NaN;
        const m = text.replace(',', '.').match(/(\d+(\.\d+)?)/);
        return m ? parseFloat(m[1]) : NaN;
    }

    function addMessage(el, text, type) {
        if (!el || el.querySelector('.oc-cpr-helper-msg')) return;
        const msg = document.createElement('div');
        msg.className = 'oc-cpr-helper-msg';

        const colors = {
            red: { color: '#e03131', bg: 'rgba(224,49,49,0.1)' },
            green: { color: '#2f9e44', bg: 'rgba(47,158,68,0.1)' },
            orange: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }
        };

        const style = colors[type] || colors.green;
        msg.style.cssText = `
            font-size: 11px; margin-top: 2px; font-weight: bold;
            color: ${style.color};
            background: ${style.bg};
            padding: 2px 6px; border-radius: 4px; z-index: 10000;`;
        msg.textContent = text;
        el.appendChild(msg);
    }

    function detectCrimeType(roleNames) {
        for (const crimeName of Object.keys(CRIME_CONFIG)) {
            const cfg = CRIME_CONFIG[crimeName];
            const matchCount = roleNames.filter(r => cfg.roles.includes(r)).length;
            if (matchCount >= 3) {
                return crimeName;
            }
        }
        return null;
    }

    function evaluateCrime(crimeName, rolesData) {
        const cfg = CRIME_CONFIG[crimeName];
        if (!cfg) return;

        const weights = ROLE_WEIGHTS[crimeName];
        let best = null;

        // Pass 1: Show warnings
        rolesData.forEach(rd => {
            const cpr = rd.cpr;
            if (!Number.isFinite(cpr) || cpr < cfg.redThreshold) {
                addMessage(rd.el, `❌Ineligible (${cfg.redThreshold}% needed)`, 'red');
            }
        });

        // Pass 2: Calculate scores with warnings
        rolesData.forEach(rd => {
            const cpr = rd.cpr;
            if (cpr < cfg.redThreshold) return;

            const excessCPR = cpr - cfg.redThreshold;
            if (excessCPR <= 0) return;

            const weight = weights[rd.roleName] || 1;
            const isHighWeight = weight >= 30;

            let score = excessCPR * weight;

            if (isHighWeight && excessCPR < 5) {
                score *= 0.1;
                addMessage(rd.el, `⚠️ Eligible (High Weight)`, 'orange');
            }

            if (!best || score > best.score) {
                best = {
                    el: rd.el,
                    score,
                    roleName: rd.roleName,
                    cpr
                };
            }
        });

        if (best) {
            addMessage(best.el,`✅ Recommended!`,'green');
        }
    }

     function processCrimes() {
        if (isProcessing) return;
        isProcessing = true;

        try {
            const wrappers = document.querySelectorAll('div.wrapper___Lpz_D');
            const processedContainers = new Set();

            wrappers.forEach(wrapper => {
                let container = wrapper;
                while (container && container !== document.body) {
                    const roles = container.querySelectorAll('span.title___UqFNy');
                    if (roles.length >= 3) break;
                    container = container.parentElement;
                }

                if (!container || processedContainers.has(container)) return;
                processedContainers.add(container);

                const roleEls = container.querySelectorAll('span.title___UqFNy');
                const allRoleNames = [];
                const openRolesData = [];

                roleEls.forEach(labelEl => {
                    const headerBtn = labelEl.closest('button.slotHeader___K2BS_');
                    if (!headerBtn) return;

                    const wrapperSlot = headerBtn.closest('div.wrapper___Lpz_D');
                    if (!wrapperSlot) return;

                    const roleName = labelEl.textContent.trim();
                    const cprEl = headerBtn.querySelector('div.successChance___ddHsR');
                    const cpr = cprEl ? parseCPR(cprEl.textContent) : NaN;
                    allRoleNames.push(roleName);
                    const joinBtn = wrapperSlot.querySelector('.joinButton___Ikoyy');
                    if (joinBtn) {
                        openRolesData.push({ roleName, cpr, el: wrapperSlot });
                    }
                });

                const crimeName = detectCrimeType(allRoleNames);
                if (crimeName && openRolesData.length > 0) {
                    evaluateCrime(crimeName, openRolesData);
                }
            });
        } finally {
            isProcessing = false;
        }
    }
    function onRelevantPage() {
        return location.href.includes('factions.php') && location.href.includes('tab=crimes');
    }

    function observePage() {
        const observer = new MutationObserver(mutations => {
            if (isProcessing) return;
            const relevant = mutations.some(m => m.addedNodes.length);
            if (!relevant) return;

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                if (!onRelevantPage()) return;
                processCrimes();}, 250);
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (onRelevantPage()) {
        setTimeout(processCrimes, 1000);
    }

    observePage();
})();
