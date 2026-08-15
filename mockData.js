export const characterMock = {
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
    }
};

export const cardsMock = [
    { id: 1, title: '光學視覺補正器', type: '義體', category: 'cyber', desc: '進行觀察與遠程射擊檢定時獲得 +1 修正。', tags: ['耐久: 100%', '消耗: 1 EP'] },
    { id: 2, title: '邊緣獵手', type: '稱號', category: 'title', desc: '在低光或廢墟環境中，潛行檢定自動獲得優勢。', tags: ['被動生效', 'RANK D'] },
    { id: 3, title: '自癒基因微粒', type: '血脈', category: 'blood', desc: '戰鬥結束後，若 HP 低於 30%，自動恢復 2d4 點生命值。', tags: ['冷卻: 1 場戰鬥', '等級 1'] },
];
