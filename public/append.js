// --- APP STATE ---
let currentCharacter = null;
let currentScenarioId = "SCENARIO-01";
let currentGameState = {};

// Mock initial character fetch
async function initCharacter() {
    // In real app, fetch from /api/character
    currentCharacter = {
        name: "亞倫 · 懷特 (Aaron)",
        level: 2,
        jobClass: "戰術專員",
        hp: {
            max: 24,
            current: 18
        },
        attributes: {
            STR: 14,
            DEX: 16,
            INT: 11,
            WIL: 13
        },
        inventory: [],
        traits: [
            { id: 1, title: '光學視覺補正器', type: '義體', category: 'cyber', desc: '進行觀察與遠程射擊檢定時獲得 +1 修正。', tags: ['耐久: 100%', '消耗: 1 EP'], style: {bg:'cyan'} },
            { id: 2, title: '邊緣獵手', type: '稱號', category: 'title', desc: '在低光或廢墟環境中，潛行檢定自動獲得優勢 (Advantage)。', tags: ['被動生效', 'RANK D'], style: {bg:'purple'} },
            { id: 3, title: '自癒基因微粒', type: '血脈', category: 'blood', desc: '戰鬥結束後，若 HP 低於 30%，自動恢復 2d4 點生命值。', tags: ['冷卻: 1 場戰鬥', '等級 1'], style: {bg:'amber'} },
        ]
    };
    renderCharacter(currentCharacter);
    renderCards(currentCharacter.traits);
}

function renderCharacter(charData) {
    document.getElementById('char-name').textContent = charData.name;
    document.getElementById('char-class').textContent = `級別 ${charData.level} / ${charData.jobClass}`;

    // Desktop HP
    const hpTextEl = document.getElementById('hp-text');
    if (hpTextEl) {
        hpTextEl.innerHTML = `${charData.hp.current} <span class="text-zinc-500">/</span> ${charData.hp.max}`;
    }

    // Mobile HP
    const mobileHpText = document.getElementById('mobile-hp-text');
    if (mobileHpText) mobileHpText.textContent = `${charData.hp.current}/${charData.hp.max}`;

    // HP Bar
    const hpContainer = document.getElementById('hp-bar-container');
    if (hpContainer) {
        const totalSegments = 12;
        const filledSegments = Math.round((charData.hp.current / charData.hp.max) * totalSegments);
        hpContainer.innerHTML = '';

        for (let i = 0; i < totalSegments; i++) {
            const seg = document.createElement('div');
            seg.className = i < filledSegments
                ? 'bg-emerald-500 rounded-sm'
                : 'bg-zinc-400 dark:bg-zinc-800 rounded-sm';
            hpContainer.appendChild(seg);
        }
    }

    // Attributes (Desktop)
    function calcMod(val) {
        if (val === 14) return "+2";
        if (val === 16) return "+3";
        if (val === 13) return "+1";
        return "+0";
    }

    const setAttr = (key, val) => {
        const attrEl = document.getElementById(`attr-${key}`);
        const modEl = document.getElementById(`mod-${key}`);
        if(attrEl) attrEl.textContent = val;
        if(modEl) {
            const mod = calcMod(val);
            modEl.textContent = mod;
            if(mod === "+0") {
                modEl.className = "text-zinc-500 text-[10px]";
            } else {
                modEl.className = "text-emerald-500 text-[10px]";
            }
        }

        // Mobile Attr
        const mobileEl = document.getElementById(`mobile-${key}`);
        if(mobileEl) mobileEl.textContent = val;
    }

    setAttr('str', charData.attributes.STR);
    setAttr('dex', charData.attributes.DEX);
    setAttr('int', charData.attributes.INT);
    setAttr('wil', charData.attributes.WIL);
}

function renderCards(traits) {
    const stackContainer = document.getElementById('cardStack');
    if (!stackContainer) return;

    // Check if cards exist already to prevent duplicates if called multiple times
    // Actually we will just overwrite
    let html = '';
    traits.forEach((trait, index) => {
        const cardClassNames = ['active', 'behind-1', 'behind-2'];
        const currentClass = cardClassNames[index % 3] || 'behind-2';

        html += `
        <div id="card-${index+1}" class="stack-card ${currentClass} asymmetric-card p-3.5 bg-zinc-100 dark:bg-zinc-900 border hairline-border space-y-1.5 shadow-xl transition-colors">
            <div class="flex items-center justify-between">
                <span class="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-${trait.style.bg}-100 dark:bg-${trait.style.bg}-950 text-${trait.style.bg}-700 dark:text-${trait.style.bg}-400 border border-${trait.style.bg}-300 dark:border-${trait.style.bg}-800/50 rounded-sm">${trait.type}</span>
            </div>
            <h4 class="text-xs font-bold text-zinc-800 dark:text-zinc-100">${trait.title}</h4>
            <p class="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug font-sans">${trait.desc}</p>
            <div class="pt-1 flex justify-between items-center text-[9px] font-mono text-zinc-500">
                <span>${trait.tags[0]}</span>
                <span>${trait.tags[1]}</span>
            </div>
        </div>`;
    });

    // Replace the mock cards with the dynamic ones
    stackContainer.innerHTML = html;
}

function appendPlayerActionBlock(actionText) {
    const feed = document.getElementById('story-feed');
    if(!feed) return;
    const html = `
    <div class="bg-zinc-200/50 dark:bg-zinc-900/80 border hairline-border p-4 rounded-sm text-zinc-900 dark:text-zinc-200 transition-colors animate-fade-in mt-4">
        <p class="italic text-sm text-zinc-600 dark:text-zinc-400 mb-1 transition-colors font-mono">▶ Player Intent</p>
        <p>"${actionText}"</p>
    </div>`;
    feed.insertAdjacentHTML('beforeend', html);
    feed.scrollTop = feed.scrollHeight;
}

function appendDMNarrationBlock(narrationText, promptQuestion) {
    const feed = document.getElementById('story-feed');
    if(!feed) return;
    let html = `
    <div class="border-l hairline-border pl-4 animate-fade-in mt-4">
        <p class="text-zinc-800 dark:text-zinc-300 leading-relaxed transition-colors">
            ${narrationText}
        </p>
    </div>`;

    if (promptQuestion) {
        html += `
        <div class="border-l-2 border-emerald-500 pl-4 mt-4 animate-fade-in mb-4">
            <p class="font-bold text-zinc-900 dark:text-zinc-100 transition-colors">
                ${promptQuestion}
            </p>
        </div>`;
    }
    feed.insertAdjacentHTML('beforeend', html);
    feed.scrollTop = feed.scrollHeight;
}

function appendCheckResultBlock(result) {
    const feed = document.getElementById('story-feed');
    if(!feed) return;
    const statusClass = result.success ? "text-emerald-600 dark:text-emerald-500" : "text-red-600 dark:text-red-500";
    const statusText = result.success ? "SUCCESS" : "FAILURE";

    const html = `
    <div class="bg-zinc-200/50 dark:bg-zinc-950/80 border hairline-border p-3 font-mono text-xs hud-corner-box transition-colors mx-4 mt-4 animate-fade-in">
        <div class="text-zinc-600 dark:text-zinc-500 mb-1 transition-colors">SYSTEM.CHECK_RESOLUTION</div>
        <div class="flex justify-between items-center text-sm">
            <span class="text-zinc-900 dark:text-zinc-300 transition-colors">檢定結果</span>
            <span class="${statusClass} transition-colors">${statusText}</span>
        </div>
        <div class="text-zinc-600 dark:text-zinc-500 mt-1 transition-colors">
            骰池 (${result.dp}) = 成功數 <span class="text-zinc-900 dark:text-zinc-200 transition-colors">${result.totalSuccesses}</span> vs 對抗 (${result.dc})
        </div>
    </div>`;
    feed.insertAdjacentHTML('beforeend', html);
    feed.scrollTop = feed.scrollHeight;
}

// Action sending logic
async function sendPlayerAction(actionText) {
    if (!actionText || actionText.trim() === '') return;

    // Clear inputs
    document.querySelectorAll('input[type="text"]').forEach(input => input.value = '');

    appendPlayerActionBlock(actionText);

    try {
        const res = await fetch('/api/narrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                character: currentCharacter,
                checkParams: { dp: 5, dc: 2 }, // Mock params, usually determined by parsed action
                playerAction: actionText,
                sceneContext: "戰鬥場景",
                recentEvents: []
            })
        });

        if (res.ok) {
            const data = await res.json();
            appendDMNarrationBlock(data.narration || "系統回覆中斷。", "你要如何回應？");
        } else {
            // Mock response if API is unreachable (for design showcase)
            setTimeout(() => {
                appendDMNarrationBlock(`這是一個模擬的回應，因為後端 API (${res.status}) 無法直接存取。您的動作 "${actionText}" 已被記錄。`, "接下來你要做什麼？");
            }, 800);
        }
    } catch (err) {
        console.error('Narrate API Error:', err);
        setTimeout(() => {
            appendDMNarrationBlock(`這是一個模擬的回應 (API Fetch Error)。您的動作 "${actionText}" 已被記錄。`, "接下來你要做什麼？");
        }, 800);
    }
}

// Attach listeners to input fields
document.addEventListener('DOMContentLoaded', () => {
    initCharacter();

    const inputs = document.querySelectorAll('input[type="text"]');
    inputs.forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendPlayerAction(e.target.value);
            }
        });
    });

    // Attach to [A] [B] buttons
    const actionButtons = document.querySelectorAll('button:has(span)'); // A bit naive, but works for mock buttons
    actionButtons.forEach(btn => {
        if (btn.innerText.includes('[A]') || btn.innerText.includes('[B]')) {
            btn.addEventListener('click', (e) => {
                const text = e.currentTarget.innerText.replace(/\[[AB]\]/g, '').trim();
                sendPlayerAction(text);
            });
        }
    });
});

// Update dice logic for real fetch
window.triggerDiceRoll = async function triggerDiceRoll() {
    if (typeof drawerOpen !== 'undefined' && drawerOpen) {
        toggleDrawer();
    }

    const diceModal = document.getElementById('diceModal');
    const d20svg = document.getElementById('d20svg');
    const d20container = document.getElementById('d20container');
    const diceStatus = document.getElementById('diceStatus');
    const diceFormula = document.getElementById('diceFormula');
    const diceResultText = document.getElementById('diceResultText');

    diceModal.classList.remove('opacity-0', 'pointer-events-none');
    d20svg.classList.remove('animate-tumble');
    d20container.classList.remove('scale-150');
    diceResultText.style.opacity = '0';
    diceFormula.style.opacity = '0';
    diceStatus.textContent = 'SCANNING ATTRIBUTES...';
    diceStatus.classList.add('animate-pulse');

    void d20svg.offsetWidth;
    d20svg.classList.add('animate-tumble');

    // Simulate attribute parameters for the check (mock values)
    const mockCheckParams = {
        dp: currentCharacter.attributes.DEX + 2, // e.g., DEX + skill
        dc: 4 // e.g., difficulty class
    };

    try {
        const response = await fetch('/api/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                character: currentCharacter,
                params: mockCheckParams
            })
        });

        let result = null;
        if (response.ok) {
            const resData = await response.json();
            result = resData.result;
        } else {
            // Mock result for showcase if API fails
            result = {
                totalSuccesses: Math.floor(Math.random() * 5) + 3,
                dp: mockCheckParams.dp,
                dc: mockCheckParams.dc,
                success: true
            };
            result.success = result.totalSuccesses >= result.dc;
        }

        setTimeout(() => {
            diceStatus.textContent = 'CALCULATING MODIFIERS...';
        }, 500);

        setTimeout(() => {
            diceStatus.textContent = 'CHECK RESOLVED!';
            diceStatus.classList.remove('animate-pulse');
            d20container.classList.add('scale-150');
            diceResultText.style.opacity = '1';
            diceFormula.style.opacity = '1';

            diceResultText.textContent = result.totalSuccesses;
            diceFormula.textContent = `骰池判定 (${result.dp}) 成功數 = ${result.totalSuccesses} vs 對抗 (${result.dc})`;

            appendCheckResultBlock(result);

        }, 1500);

    } catch (e) {
        console.error("Check API Error", e);
        // Fallback animation
        setTimeout(() => {
            diceStatus.textContent = 'CHECK RESOLVED! (MOCK)';
            diceStatus.classList.remove('animate-pulse');
            d20container.classList.add('scale-150');
            diceResultText.style.opacity = '1';
            diceFormula.style.opacity = '1';
            diceResultText.textContent = "7";
            diceFormula.textContent = `骰池判定 (14) 成功數 = 7`;
        }, 1500);
    }

    setTimeout(() => {
        const closeHandler = () => {
            diceModal.classList.add('opacity-0', 'pointer-events-none');
            d20container.classList.remove('scale-150');
            diceModal.removeEventListener('click', closeHandler);
        };
        diceModal.addEventListener('click', closeHandler);
    }, 1600);
}
