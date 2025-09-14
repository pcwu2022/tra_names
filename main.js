// TRA Station Guessing Game JS

// Control points for mapping
const controlPoints = [
    { svg: [1190, 75], geo: [25.29943622138443, 121.5368229594424] },
    { svg: [1439, 241], geo: [25.01116434704085, 122.00698864046247] },
    { svg: [829, 2055], geo: [21.896963803399828, 120.85961721500483] },
    { svg: [382, 1371], geo: [23.102314224470195, 120.03582350380297] }
];

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

// Load TRA station data
fetch('data/tra_data.json')
    .then(res => res.json())
    .then(data => {
        stationData = data;
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
    const maxDaily = 100000;
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
    // Tooltip on hover
    circle.addEventListener('mouseenter', function(e) {
        showTooltip(station, x, y);
    });
    circle.addEventListener('mouseleave', function(e) {
        hideTooltip();
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
    tooltip.innerHTML = `<b>${station.Name}</b><br>${station.English || ''}<br>Daily: ${station.Daily}`;
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
    const ul = document.getElementById('guessedStations');
    ul.innerHTML = '';
    guessedStations.forEach(st => {
        const li = document.createElement('li');
        li.textContent = `${st.Name} (${st.English || ''})`;
        ul.appendChild(li);
    });
}

// Update analysis section
function updateAnalysis() {
    const analysis = document.getElementById('analysis');
    if (guessedStations.length === 0) {
        analysis.innerHTML = '<em>No stations guessed yet.</em>';
        return;
    }
    const totalDaily = guessedStations.reduce((sum, st) => sum + (parseInt(st.Daily) || 0), 0);
    const top5 = [...guessedStations].sort((a, b) => (b.Daily || 0) - (a.Daily || 0)).slice(0, 5);
    const bottom5 = [...guessedStations].sort((a, b) => (a.Daily || 0) - (b.Daily || 0)).slice(0, 5);

    analysis.innerHTML = `
        <div>Stations Entered: <b>${guessedStations.length}</b></div>
        <div>Total Daily Passengers: <b>${totalDaily.toLocaleString()}</b></div>
        <div class="top-bottom-list">
            <div>
                <b>Largest 5 Stations</b>
                <ul>
                    ${top5.map(st => `<li>${st.Name} (${st.Daily})</li>`).join('')}
                </ul>
            </div>
            <div>
                <b>Smallest 5 Stations</b>
                <ul>
                    ${bottom5.map(st => `<li>${st.Name} (${st.Daily})</li>`).join('')}
                </ul>
            </div>
        </div>
    `;
}

// Handle guess
function handleGuess() {
    const input = document.getElementById('stationInput');
    const name = input.value;
    if (!name) return;
    const station = findStation(name);
    if (!station) {
        alert('Station not found. Please check the name.');
        return;
    }
    if (guessedStations.some(st => st.ID === station.ID)) {
        alert('Already guessed!');
        return;
    }
    guessedStations.push(station);
    addStationMarker(station);
    updateGuessedList();
    updateAnalysis();
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

window.addEventListener('DOMContentLoaded', () => {
    const obj = document.getElementById('taiwanSVG');
    obj.addEventListener('load', function() {
        // Get loaded SVG element
        const svgDoc = obj.contentDocument;
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
    });
});

// Load svg-pan-zoom library
const script = document.createElement('script');
script.src = 'https://unpkg.com/svg-pan-zoom/dist/svg-pan-zoom.min.js';
document.body.appendChild(script);
document.body.appendChild(script);
