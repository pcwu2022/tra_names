// TRA Station Guessing Game JS

// Control points for mapping
const controlPoints = [
    { svg: [1190, 75], geo: [25.29943622138443, 121.5368229594424] },
    { svg: [1439, 241], geo: [25.01116434704085, 122.00698864046247] },
    { svg: [829, 2055], geo: [21.896963803399828, 120.85961721500483] },
    { svg: [382, 1371], geo: [23.102314224470195, 120.03582350380297] }
];

// Map lines to names
const lineNames = {
    A: "縱貫線北段",
    T: "山線",
    E: "宜蘭線",
    M: "花東線",
    V: "內灣線",
    P: "屏東線",
    J: "南迴線",
    I: "北迴線",
    N: "平溪線",
    C: "集集線",
    B: "沙崙線",
    R: "深澳線"
};

function getLineName(id) {
    const code = id ? id[0] : null;
    if (code === "A") {
        const twoDigits = parseFloat(id.slice(1, 3));
        if (!isNaN(twoDigits)) {
            if (twoDigits < 33) return "縱貫線北段";
            else if (twoDigits < 49) return "海線";
            else return "縱貫線南段";
        }
    }
    return lineNames[code] || code;
}

// Helper: Affine transform from lat/lon to SVG coordinates
function latLonToSvg(lat, lon) {
    // Solve affine transform using least squares
    // Ax = b, where x = [a,b,c,d,e,f] for:
    // x_svg = a*lat + b*lon + c
    // y_svg = d*lat + e*lon + f
    // Build matrices
    const A = [];
    const bx = [];
    const by = [];
    controlPoints.forEach(pt => {
        const [lat_, lon_] = pt.geo;
        A.push([lat_, lon_, 1, 0, 0, 0]);
        A.push([0, 0, 0, lat_, lon_, 1]);
        bx.push(pt.svg[0]);
        by.push(pt.svg[1]);
    });
    // Solve for x using least squares
    // [A1|A2] * [x1;x2] = [bx;by]
    // Stack A and b
    const M = [];
    const B = [];
    for (let i = 0; i < 4; i++) {
        M.push(A[i*2]);
        B.push(bx[i]);
        M.push(A[i*2+1]);
        B.push(by[i]);
    }
    // Use numeric.js for least squares (or manual)
    // For 6x6, use Cramer's rule
    function solve6x6(A, b) {
        // Gaussian elimination
        const m = A.map(row => row.slice());
        const bb = b.slice();
        for (let i = 0; i < 6; i++) {
            // Find pivot
            let maxRow = i;
            for (let j = i+1; j < 6; j++) {
                if (Math.abs(m[j][i]) > Math.abs(m[maxRow][i])) maxRow = j;
            }
            // Swap
            [m[i], m[maxRow]] = [m[maxRow], m[i]];
            [bb[i], bb[maxRow]] = [bb[maxRow], bb[i]];
            // Eliminate
            for (let j = i+1; j < 6; j++) {
                const f = m[j][i] / m[i][i];
                for (let k = i; k < 6; k++) m[j][k] -= f * m[i][k];
                bb[j] -= f * bb[i];
            }
        }
        // Back-substitute
        const x = Array(6).fill(0);
        for (let i = 5; i >= 0; i--) {
            let sum = 0;
            for (let j = i+1; j < 6; j++) sum += m[i][j] * x[j];
            x[i] = (bb[i] - sum) / m[i][i];
        }
        return x;
    }
    const params = solve6x6(M, B);
    // Use params to map
    const x_svg = params[0]*lat + params[1]*lon + params[2];
    const y_svg = params[3]*lat + params[4]*lon + params[5];
    return [x_svg, y_svg];
}

// Store station data and guessed stations
let stationData = [];
let guessedStations = [];
let overallDailyRidership = 0;

// Load TRA station data
fetch('data/tra_data.json')
    .then(res => res.json())
    .then(data => {
        stationData = data;
        overallDailyRidership = stationData.reduce((sum, st) => sum + (parseInt(st.Daily) || 0), 0);
        dataReady = true;
        tryResumeGame();
    });

// Helper: Find station by name (Chinese or English, case-insensitive)
function findStation(name) {
    name = name.trim().toLowerCase();
    return stationData.find(st =>
        st.Name.toLowerCase() === name ||
        (st.English && st.English.toLowerCase() === name)
    );
}

// Add marker for guessed station (size proportional to daily ridership)
function addStationMarker(station) {
    if (!station.latitude || !station.longitude || !stationMarkersGroup) return;
    // Calculate radius proportional to daily ridership
    const minRadius = 6;
    const maxRadius = 24;
    const minDaily = 100;
    const maxDaily = 200000;
    let daily = parseInt(station.Daily) || minDaily;
    daily = Math.max(minDaily, Math.min(maxDaily, daily));
    const radius = minRadius + (maxRadius - minRadius) * (Math.log10(daily) - Math.log10(minDaily)) / (Math.log10(maxDaily) - Math.log10(minDaily));
    // Map lat/lon to SVG coordinates
    const [x, y] = latLonToSvg(station.latitude, station.longitude);
    // Add SVG circle to loaded SVG
    const circle = svgMapEl.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', radius);
    circle.setAttribute('fill', '#0078d7');
    circle.setAttribute('fill-opacity', '0.5');
    circle.setAttribute('stroke', 'none');
    circle.setAttribute('data-name', station.Name);
    circle.setAttribute('data-english', station.English || '');
    circle.setAttribute('data-daily', station.Daily);

    // Native SVG tooltip
    const title = svgMapEl.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = station.Name;
    circle.appendChild(title);

    // Custom tooltip on hover/click
    circle.addEventListener('mouseenter', function(e) {
        showTooltip(station, x, y);
    });
    circle.addEventListener('mouseleave', function(e) {
        hideTooltip();
    });
    circle.addEventListener('click', function(e) {
        showTooltip(station, x, y);
        e.stopPropagation();
    });
    stationMarkersGroup.appendChild(circle);
}

// Tooltip logic
function showTooltip(station, x, y) {
    let tooltip = document.getElementById('svgTooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'svgTooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.background = '#fff';
        tooltip.style.border = '1px solid #0078d7';
        tooltip.style.borderRadius = '6px';
        tooltip.style.padding = '8px';
        tooltip.style.fontSize = '1em';
        tooltip.style.zIndex = 10;
        document.querySelector('.svg-bg').appendChild(tooltip);
    }
    tooltip.innerHTML = `<b>${station.Name}</b><br>${station.English || ''}<br>每日進出人次：${station.Daily}`;
    // Position tooltip (SVG coords to px)
    if (!svgMapEl) return;
    const bbox = document.getElementById('taiwanSVG').getBoundingClientRect();
    let vb = svgMapEl.getAttribute('viewBox');
    let vbArr = vb ? vb.split(' ').map(Number) : [0, 0, 1920, 2160];
    let vbWidth = vbArr[2] || 1920;
    let vbHeight = vbArr[3] || 2160;
    tooltip.style.left = (bbox.left + x * bbox.width / vbWidth) + 'px';
    tooltip.style.top = (bbox.top + y * bbox.height / vbHeight - 40) + 'px';
    tooltip.style.display = 'block';
}
function hideTooltip() {
    const tooltip = document.getElementById('svgTooltip');
    if (tooltip) tooltip.style.display = 'none';
}

// Update guessed stations list
function updateGuessedList() {
    const ol = document.getElementById('guessedStations');
    ol.innerHTML = '';
    guessedStations.forEach(st => {
        const li = document.createElement('li');
        li.textContent = `${st.Name} (${st.English || ''})`;
        ol.insertBefore(li, ol.firstChild);
    });
}

// Update analysis section
function updateAnalysis() {
    const analysis = document.getElementById('analysis');
    if (guessedStations.length === 0) {
        analysis.innerHTML = '<em>尚未猜任何車站。</em>';
        return;
    }
    // 最大/最小車站
    const top20 = [...guessedStations].sort((a, b) => (b.Daily || 0) - (a.Daily || 0)).slice(0, 20);
    const bottom20 = [...guessedStations].sort((a, b) => (a.Daily || 0) - (b.Daily || 0)).slice(0, 20);

    // 最佳路線
    const lineCounts = {};
    guessedStations.forEach(st => {
        const line = getLineName(st.ID);
        lineCounts[line] = (lineCounts[line] || 0) + 1;
    });
    const bestLines = Object.entries(lineCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([line, count]) => `${line} — ${count}`)
        .slice(0, 20);

    // 其他統計
    const over20000 = guessedStations.filter(st => (parseInt(st.Daily) || 0) >= 20000).length;
    const over5000 = guessedStations.filter(st => (parseInt(st.Daily) || 0) >= 5000).length;
    const over1000 = guessedStations.filter(st => (parseInt(st.Daily) || 0) >= 1000).length;
    const percent20000 = ((over20000 / stationData.filter(st => (parseInt(st.Daily) || 0) >= 20000).length) * 100).toFixed(1);
    const percent5000 = ((over5000 / stationData.filter(st => (parseInt(st.Daily) || 0) >= 5000).length) * 100).toFixed(1);
    const percent1000 = ((over1000 / stationData.filter(st => (parseInt(st.Daily) || 0) >= 1000).length) * 100).toFixed(1);

    analysis.innerHTML = `
        <div>已輸入：<b>${guessedStations.length}&nbsp;/&nbsp;${stationData.length} ( ${Math.round(guessedStations.length / stationData.length * 1000)/10}% )</b>&nbsp;站</div>
        <div>總每日進出人次：<b>${guessedStations.reduce((sum, st) => sum + (parseInt(st.Daily) || 0), 0).toLocaleString()} (${((guessedStations.reduce((sum, st) => sum + (parseInt(st.Daily) || 0), 0) / stationData.reduce((sum, st) => sum + (parseInt(st.Daily) || 0), 0)) * 100).toFixed(1)}%)</b></div>
        <br>
        <div>
            <b>最大車站</b>
            <ul class="rank">
                ${top20.map(st => `<li>${st.Name} (${st.English || ''}) <b>${st.Daily}</b></li>`).join('')}
            </ul>
        </div>
        <div>
            <b>最小車站</b>
            <ul class="rank">
                ${bottom20.map(st => `<li>${st.Name} (${st.English || ''}) <b>${st.Daily}</b></li>`).join('')}
            </ul>
        </div>
        <div>
            <b>最佳路線</b>
            <ul class="rank">
                ${bestLines.map(line => `<li>${line}</li>`).join('')}
            </ul>
        </div>
        <div>
            <b>其他統計</b>
            <ul>
                <li>每日進出人次 &ge; 20,000：${over20000} / ${stationData.filter(st => (parseInt(st.Daily) || 0) >= 20000).length} (${percent20000}%)</li>
                <li>每日進出人次 &ge; 5,000：${over5000} / ${stationData.filter(st => (parseInt(st.Daily) || 0) >= 5000).length} (${percent5000}%)</li>
                <li>每日進出人次 &ge; 1,000：${over1000} / ${stationData.filter(st => (parseInt(st.Daily) || 0) >= 1000).length} (${percent1000}%)</li>
            </ul>
        </div>
    `;
}

// Input sanitization
function sanitizeInput(name) {
    let output = name.trim();
    output = output
        .replaceAll('台', '臺')
        .replaceAll('車站', '')
        .replaceAll('站', '');
    return output;
}

// Save game state to localStorage
function saveGame() {
    // Save guessed station IDs to localStorage
    localStorage.setItem('tra_guessed', JSON.stringify(guessedStations.map(st => st.ID)));
}

// Load game state from localStorage
function loadGame() {
    // Load guessed station IDs from localStorage
    const ids = JSON.parse(localStorage.getItem('tra_guessed') || '[]');
    return ids;
}

// Clear game state
function clearGame() {
    localStorage.removeItem('tra_guessed');
    guessedStations = [];
    // Remove markers from SVG
    if (stationMarkersGroup) {
        while (stationMarkersGroup.firstChild) {
            stationMarkersGroup.removeChild(stationMarkersGroup.firstChild);
        }
    }
    updateGuessedList();
    updateAnalysis();
}

// Handle guess
function handleGuess() {
    const input = document.getElementById('stationInput');
    const name = sanitizeInput(input.value);
    if (!name) return;
    const station = findStation(name);
    if (!station) {
        alert('查無此車站，請確認名稱是否正確。');
        return;
    }
    if (guessedStations.some(st => st.ID === station.ID)) {
        alert('此車站已猜過！');
        return;
    }
    guessedStations.push(station);
    addStationMarker(station);
    updateGuessedList();
    updateAnalysis();
    saveGame();
    input.value = '';
}

document.getElementById('guessBtn').onclick = handleGuess;
document.getElementById('stationInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        handleGuess();
    }
});

// Wait for SVG to load and initialize pan/zoom
let svgMapEl = null; // reference to loaded SVG element
let stationMarkersGroup = null; // reference to <g> for markers
let svgReady = false;
let dataReady = false;

// Load TRA station data
fetch('data/tra_data.json')
    .then(res => res.json())
    .then(data => {
        stationData = data;
        overallDailyRidership = stationData.reduce((sum, st) => sum + (parseInt(st.Daily) || 0), 0);
        dataReady = true;
        tryResumeGame();
    });

// Wait for SVG to load and initialize pan/zoom
window.addEventListener('DOMContentLoaded', () => {
    const obj = document.getElementById('taiwanSVG');
    obj.addEventListener('load', function() {
        // Detect SVG load failure and reload if necessary (max 3 times)
        const reloadKey = 'svg_reload_count';
        let reloadCount = parseInt(sessionStorage.getItem(reloadKey) || '0', 10);

        const svgDoc = obj.contentDocument;
        if (reloadCount < 1) {
            sessionStorage.setItem(reloadKey, reloadCount + 1);
            location.reload();
            return;
        }
        // Reset reload counter on success
        sessionStorage.removeItem(reloadKey);

        svgMapEl = svgDoc.documentElement;
        // Add <g id="stationMarkers"> if not exists
        stationMarkersGroup = svgMapEl.getElementById('stationMarkers');
        if (!stationMarkersGroup) {
            stationMarkersGroup = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'g');
            stationMarkersGroup.setAttribute('id', 'stationMarkers');
            svgMapEl.appendChild(stationMarkersGroup);
        }
        // Enable pan/zoom on SVG
        if (window.svgPanZoom) {
            window.svgPanZoom(obj, {
                zoomEnabled: true,
                controlIconsEnabled: true,
                fit: true,
                center: true
            });
        }
        svgReady = true;
        tryResumeGame();
    });
});

// Ensure resume/restore logic only runs when both SVG and data are ready
function tryResumeGame() {
    if (!svgReady || !dataReady) return;
    const savedIDs = loadGame();
    if (savedIDs.length > 0 && stationData.length > 0) {
        // Only add restart button if not already present
        if (!document.getElementById('restartBtn')) {
            const btn = document.createElement('button');
            btn.id = 'restartBtn';
            btn.textContent = '重新開始';
            btn.style.marginLeft = '8px';
            btn.onclick = function() {
                if (confirm('確定要重新開始遊戲嗎？目前進度將會遺失。')) {
                    clearGame();
                    btn.remove();
                }
            };
            document.querySelector('.input-section').appendChild(btn);
        }
        // Restore guessed stations
        guessedStations = savedIDs.map(id => stationData.find(st => st.ID === id)).filter(Boolean);
        // Add markers
        guessedStations.forEach(st => addStationMarker(st));
        updateGuessedList();
        updateAnalysis();
    }
}

// Load svg-pan-zoom library (only once)
const script = document.createElement('script');
script.src = 'https://unpkg.com/svg-pan-zoom/dist/svg-pan-zoom.min.js';
document.body.appendChild(script);
