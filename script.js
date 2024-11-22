"use strict";

// Determine node type
function evaluateNodeType(last, now) {
    if (last === now) {
        return [2, now % 2];
    } else if ((last + 1) % 4 == now) {
        return [3, (now + 1) % 4];
    } else if ((now + 1) % 4 == last) {
        return [3, now];
    }
}

// Generate a random path
function randomRotation(last) {
    let random = Math.random();
    if (random < rotationRate / 2) {
        return (last + 1) % 4;
    } else if (random < rotationRate) {
        return (last + 3) % 4;
    } else {
        return last;
    }
}

function invalidMovement(x, y, now) {
  let directions = [
    [1, 0], [0, 1], [-1, 0], [0, -1]
  ];

  let visited = Array.from({ length: (cols + 1) }, () => Array(rows + 1).fill(false));
  visited[x][y] = true;

  x += directions[now][0];
  y += directions[now][1];

  let queue = [];
  if(
    x >= 0 && x <= cols &&
    y >= 0 && y <= rows &&
    map[x][y][1][0] === 0
  ) {
    visited[x][y] = true;
    queue.push([x, y, 0]);
  } else return 1;


  while (queue.length > 0) {
    let [currentCol, currentRow, distance] = queue.shift();

    if (currentCol === cols && currentRow === rows) {
      return false;
    }

    for (let [dx, dy] of directions) {
      let newCol = currentCol + dx;
      let newRow = currentRow + dy;

      if(
        newCol >= 0 && newCol <= cols &&
        newRow >= 0 && newRow <= rows &&
        map[newCol][newRow][1][0] === 0 &&
        !visited[newCol][newRow]
      ) {
        queue.push([newCol, newRow, distance + 1]);
        visited[newCol][newRow] = true;
      }
    }
  }
  return true;
}

function generatePath() {
    let x = 0;
    let y = 0;
    let last = 0;

    // First step
    if (Math.random() < 0.5) {
        map[0][0][2] = [1, 0];
        x = 1;
        last = 0;
    } else {
        map[0][0][2] = [0, 1];
        y = 1;
        last = 1;
    }

    while (x != cols || y != rows) {
        let now = randomRotation(last);
        if (invalidMovement(x, y, now)) continue;
        map[x][y][1] = evaluateNodeType(last, now);


        switch (now) {
            case 0 :
                map[x++][y][2][0] = Math.random() < roadRate ? 2 : 1;
                break;
            case 1 :
                map[x][y++][2][1] = Math.random() < roadRate ? 2 : 1;
                break;
            case 2 :
                map[--x][y][2][0] = Math.random() < roadRate ? 2 : 1;
                break;
            case 3 :
                map[x][--y][2][1] = Math.random() < roadRate ? 2 : 1;
            default:
                break;
        }

        last = now;
    }

    // Last step
    map[cols][rows][1] = [2 + last, 0];
}

// Generate the group of a given path
function searchGroup(x, y, groupCount, roadNumber) {

    // Set the first cell
    let memberCount = 1;
    let queue = [[x, y]];
    map[x][y][0][0] = groupCount;

    // Search for the same group
    while (queue.length > 0) {
        let [currentCol, currentRow] = queue.shift();

        if (currentCol < cols - 1 && !map[currentCol + 1][currentRow][roadNumber][1] && !map[currentCol + 1][currentRow][0][0]) {
            queue.push([currentCol + 1, currentRow]);
            map[currentCol + 1][currentRow][0][0] = groupCount;
            map[currentCol + 1][currentRow][0][1] = memberCount++;
        }
        if (currentRow < rows - 1 && !map[currentCol][currentRow + 1][roadNumber][0] && !map[currentCol][currentRow + 1][0][0]) {
            queue.push([currentCol, currentRow + 1]);
            map[currentCol][currentRow + 1][0][0] = groupCount;
            map[currentCol][currentRow + 1][0][1] = memberCount++;
        }
        if (currentCol > 0 && !map[currentCol][currentRow][roadNumber][1] && !map[currentCol - 1][currentRow][0][0]) {
            queue.push([currentCol - 1, currentRow]);
            map[currentCol - 1][currentRow][0][0] = groupCount;
            map[currentCol - 1][currentRow][0][1] = memberCount++;
        }
        if (currentRow > 0 && !map[currentCol][currentRow][roadNumber][0] && !map[currentCol][currentRow - 1][0][0]) {
            queue.push([currentCol, currentRow - 1]);
            map[currentCol][currentRow - 1][0][0] = groupCount;
            map[currentCol][currentRow - 1][0][1] = memberCount++;
        }
    }
    return memberCount;
}

function generateGroup(roadNumber) {
    clearMap([0]);

    let memberCount = [];
    for (let i = 0; i < cols; ++i) {
        for (let j = 0; j < rows; ++j) {
            if (map[i][j][0][0]) {
                continue;
            } else {
                memberCount.push(searchGroup(i, j, memberCount.length + 1, roadNumber));
            }
        }
    }
    return memberCount;
}

// Generate random integer from 0 to n
function randomInt(n) {
    return Math.floor(Math.random() * n);
}  

// Apply created path
function createSign(x, y, type, number, distance, last) {
    const newSign = document.createElement('div');
    newSign.setAttribute('x', x);
    newSign.setAttribute('y', y);
    newSign.setAttribute('type', type);
    newSign.classList.add('sign');

    if(number === undefined) {
        newSign.setAttribute('number', randomInt(typeScale[type]));
    } else {
        newSign.setAttribute('number', number);
    }

    newSign.style.left = `${5 * x + 1}vh`;
    newSign.style.top = `${5 * y + 1}vh`;

    if (distance !== undefined) {
        newSign.classList.add('user');
        newSign.setAttribute('distance', distance);
    }
    if (last !== undefined) {
        newSign.setAttribute('last', last);
    }
    board.appendChild(newSign);
}

function calculateGPA() {
    if (level < 0) {
        level = 0;
    }
    const scalingFactor = 0.05;
    const GPA = 1 + 3.3 * (1 - Math.exp(-scalingFactor * level));
    return GPA.toFixed(2);
}

function applyPath() {
    createSign(0, 0, 4, 0);
    createSign(cols, rows, 4, 1);
    createSign(cols, rows, 4, 2);
    createSign(cols, rows, 4, 3);
    createSign(cols, rows, 4, 4);

    for (let i = 0; i <= cols; ++i) {
        for (let j = 0; j <= rows; ++j) {
            // Apply node setting
            if (map[i][j][1][0]) {
                createSign(i, j, map[i][j][1][0], map[i][j][1][1]);
            }

            // Apply road setting
            if (map[i][j][2][0]) {
                createSign(i, j, 1, 0);

                if (map[i][j][2][0] == 2) {
                    createSign(i, j, 5);
                }
            }
            if (map[i][j][2][1]) {
                createSign(i, j, 1, 1);

                if (map[i][j][2][1] == 2) {
                    createSign(i, j, 6);
                }
            }

            // Apply cell setting
            if (i === cols || j === rows) {
                continue;
            }

            switch (map[i][j][3][0]) {
                // Types that don't need random number
                case 0 : case 11 : case 12 : case 13 :
                    createSign(i, j, map[i][j][3][0], map[i][j][3][1]);
                    break;
                
                // Types that do need random number
                case 7 : case 8 : case 9 : case 10 :
                    createSign(i, j, map[i][j][3][0]);
                default:
                    break;
            }
        }
    }
    
}

// Randomly add some sign to the board according to the generated path
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; --i) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function randomSet(size, n) {
    let set = new Set();
    while (set.size < size) {
        set.add(randomInt(n));
    }
    return set;
}

// Evaluate given group member count
function invalidGroup(memberCount) {
    if (memberCount.length < 4) return 1;
    for (let i = 0; i < memberCount.length; ++i) {
        if (memberCount[i] > cols * rows / 3 || memberCount[i] < cols * rows / 16) {
            return 1;
        }
    }
    return 0;
}

function generateSign(memberCount) {
    if (invalidGroup(memberCount)) return 1;
    // Random list of collegeIndex
    let collegeIndex = shuffleArray([7, 8, 9, 10])
    let groupProperties = new Array(memberCount.length);
    for (let i = 0; i < memberCount.length; ++i) {
        groupProperties[i] = new Array(4);
        groupProperties[i][0] = memberCount[i];
        groupProperties[i][1] = collegeIndex[i % 4];
        groupProperties[i][2] = (memberCount[i] < 8) ? 0 : randomInt(4);
        switch (groupProperties[i][2]) {
            case 1 : case 2 :
                groupProperties[i][3] = randomSet(2, memberCount[i]);
                break;
            case 3 :
                groupProperties[i][3] = randomSet(4, memberCount[i]);
                break;
            default :
                groupProperties[i][3] = new Set();
        }
    }

    // Apply sign set up
    for (let i = 0; i < cols; ++i) {
        for (let j = 0; j < rows; ++j) {
            if (groupProperties[map[i][j][0][0] - 1][3].delete(map[i][j][0][1])) {
                switch (groupProperties[map[i][j][0][0] - 1][2]) {
                    case 1 :
                        map[i][j][3][0] = 11;
                        map[i][j][3][1] = groupProperties[map[i][j][0][0] - 1][3].size;
                        break;
                    case 2 :
                        map[i][j][3][0] = 12;
                        map[i][j][3][1] = groupProperties[map[i][j][0][0] - 1][3].size;
                        break;
                    case 3 :
                        map[i][j][3][0] = 11 + Math.floor(groupProperties[map[i][j][0][0] - 1][3].size / 2);
                        map[i][j][3][1] = groupProperties[map[i][j][0][0] - 1][3].size % 2;
                        break;
                    default :
                        break;
                }
                continue;
            }

            if (Math.random() < signRate / Math.sqrt(groupProperties[map[i][j][0][0] - 1][0])) {
                map[i][j][3][0] = groupProperties[map[i][j][0][0] - 1][1];
            }
        }
    }
    return 0;
}

function clearMap(array) {
    for (let i = 0; i <= cols; ++i) {
        for (let j = 0; j <= rows; ++j) {
            for (const num of array) {
                map[i][j][num] = [0, 0];
            }
            if (array.includes(3) && (i + j) % 2) {
                map[i][j][3][1] = 1;
            }
        }
    }
}

// Delete created path
function deletePath() {
    document.getElementById('GPA').innerText = `GPA ${calculateGPA()}`;
    // Initialise board
    document.documentElement.style.setProperty('--cols', cols);
    document.documentElement.style.setProperty('--rows', rows);
    // Remove all the .sign element
    document.querySelectorAll('.sign').forEach(element => element.remove());
    cols = Math.floor((level) / 20 + 3.5);
    rows = Math.floor((level) / 20 + 3);
    map = createNewMap();
}

function hideAnswer() {
    document.querySelectorAll('.sign[type = "1"]').forEach(element => element.remove());
    document.querySelectorAll('.sign[type = "2"]').forEach(element => element.remove());
    document.querySelectorAll('.sign[type = "3"]').forEach(element => element.remove());
    if(document.querySelector('.sign[type = "4"][number = "4"]')){
        document.querySelector('.sign[type = "4"][number = "4"]').remove();
    }
}

function showAnswer() {
    document.querySelectorAll('.sign').forEach(element => element.remove());
    applyPath();
}

// Evaluate the user path
function evaluatePath(memberCount) {
    let groupProperties = new Array(memberCount.length);
    for (let i = 0; i < memberCount.length; ++i) {
        groupProperties[i] = new Array(6).fill(0);
        groupProperties[i][0] = memberCount[i];
    }

    for (let i = 0; i < cols; ++i) {
        for (let j = 0; j < rows; ++j) {
            switch(map[i][j][3][0]) {
                case 7 : case 8 : case 9 : case 10 :
                    if (groupProperties[map[i][j][0][0] - 1][1] === 0) {
                        groupProperties[map[i][j][0][0] - 1][1] = map[i][j][3][0];
                    } else if (groupProperties[map[i][j][0][0] - 1][1] !== map[i][j][3][0]) {
                        return false;
                    }
                    break;
                case 11 : case 12 :
                    if (groupProperties[map[i][j][0][0] - 1][map[i][j][3][0] + map[i][j][3][1] - 10] === 0) {
                        groupProperties[map[i][j][0][0] - 1][map[i][j][3][0] + map[i][j][3][1] - 10] = 1
                    } else {
                        return false;
                    }
                default:
                    break;
            }
            if (map[i][j][2][0] === 2 && !map[i][j][5][0] ||
                map[i][j][2][1] === 2 && !map[i][j][5][1]
            ) {
                return false;
            }
        }
    }
    for (let i = 0; i < memberCount.length; ++i) {
        if(groupProperties[i][2] !== groupProperties[i][3] || groupProperties[i][4] !== groupProperties[i][5]) {
            return false;
        }
    }
    return true;
}

// Handle user input
function clearUserPath() {
    document.querySelectorAll('.user').forEach(element => element.remove());
    clearMap([4, 5]);
}

function regeneratePath() {
    deletePath();
    generatePath();
    while (generateSign(generateGroup(2))) {
        deletePath();
        generatePath();
    }
    applyPath();
    hideAnswer();
}

function createNewMap() {
    let newArray = new Array(cols + 1);
    for (let i = 0; i <= cols; ++i) {
        newArray[i] = new Array(rows + 1);
        for (let j = 0; j <= rows; ++j) {
            newArray[i][j] = new Array(6);
            for (let k = 0; k < 6; ++k) {
                newArray[i][j][k] = new Array(2).fill(0);
            }
    
            if ((j + i) % 2) {
                newArray[i][j][3][1] = 1;
            }
        }
    }
    return newArray;
}

function handleKey(event) {
    if (typeof handleKey.x === 'undefined') {
        handleKey.x = 0;
    }
    if (typeof handleKey.y === 'undefined') {
        handleKey.y = 0;
    }
    if (typeof handleKey.last === 'undefined') {
        handleKey.last = 0;
    }
    if (typeof handleKey.distance === 'undefined') {
        handleKey.distance = 0;
    }

    let now = -1;

    switch (event.key) {
        case 'ArrowRight' : case 'd' :
            if (handleKey.x < cols && !map[handleKey.x + 1][handleKey.y][4][0]) {
                now = 0;
            } else if (handleKey.x === cols && handleKey.y === rows) {
                now = 0;
                map[handleKey.x][handleKey.y][4] = evaluateNodeType(handleKey.last, now);
                createSign(handleKey.x, handleKey.y, map[handleKey.x][handleKey.y][4][0], map[handleKey.x][handleKey.y][4][1], ++handleKey.distance, handleKey.last);
                createSign(cols, rows, 4, 4, handleKey.distance);
                if (evaluatePath(generateGroup(5))) {
                    ++level;
                    handleKey.x = 0;
                    handleKey.y = 0;
                    handleKey.last = 0;
                    handleKey.distance = 0;
                    regeneratePath();
                } else {
                    document.getElementById('wrong').style.opacity = 1;
                    setTimeout(() => {
                        document.getElementById('wrong').style.opacity = 0;
                    }, 2000);
                }
                return;
            } else return;
            break;
        case 'ArrowDown' : case 's' :
            if (handleKey.y < rows && !map[handleKey.x][handleKey.y + 1][4][0]) {
                now = 1;
            } else {
                return;
            }
            break;
        case 'ArrowLeft' : case 'a' :
            if (handleKey.x > 0 && !map[handleKey.x - 1][handleKey.y][4][0]) {
                now = 2;
            } else {
                return;
            }
            break;
        case 'ArrowUp' : case 'w' :
            if (handleKey.y > 0 && !map[handleKey.x][handleKey.y - 1][4][0]) {
                now = 3;
            } else {
                return;
            }
            break;
        case 'Backspace' :
            if (handleKey.distance === 0) {
                handleKey.x = 0;
                handleKey.y = 0;
                document.querySelectorAll(`[distance = "0"]`).forEach(element => element.remove());
                return;
            }

            // Delete road
            if (handleKey.x != cols && handleKey.y != rows) {
                const lastRoad = document.querySelector(`[type = "1"][distance = "${handleKey.distance}"]`);
                handleKey.x = parseInt(lastRoad.getAttribute('x'));
                handleKey.y = parseInt(lastRoad.getAttribute('y'));
                map[handleKey.x][handleKey.y][5][parseInt(lastRoad.getAttribute('number'))] = 0;
            }

            // Delete node
            const lastNode = document.querySelector(`[type = "2"][distance = "${handleKey.distance}"], [type = "3"][distance = "${handleKey.distance}"]`);
            handleKey.x = parseInt(lastNode.getAttribute('x'));
            handleKey.y = parseInt(lastNode.getAttribute('y'));
            map[handleKey.x][handleKey.y][4][0] = 0;
            map[handleKey.x][handleKey.y][4][1] = 0;

            handleKey.last = parseInt(lastNode.getAttribute('last'));
            document.querySelectorAll(`[distance = "${handleKey.distance--}"]`).forEach(element => element.remove());
            return;
        case 'r' :
            handleKey.x = 0;
            handleKey.y = 0;
            handleKey.last = 0;
            handleKey.distance = 0;
            clearUserPath();
            return;
        case 'Enter' :
            --level;
            event.preventDefault();
            event.stopPropagation();
            handleKey.x = 0;
            handleKey.y = 0;
            handleKey.last = 0;
            handleKey.distance = 0;
            clearUserPath();
            showAnswer();
            break;
        case 'Shift' :
            event.preventDefault();
            event.stopPropagation();
            hideAnswer();
            break;
        case 'Tab' :
            --level;
            handleKey.x = 0;
            handleKey.y = 0;
            handleKey.last = 0;
            handleKey.distance = 0;
            event.preventDefault();
            event.stopPropagation();
            regeneratePath();
            break;
        default:
            return;
    }

    map[handleKey.x][handleKey.y][4] = evaluateNodeType(handleKey.last, now);
    if (handleKey.x || handleKey.y) createSign(handleKey.x, handleKey.y, map[handleKey.x][handleKey.y][4][0], map[handleKey.x][handleKey.y][4][1], ++handleKey.distance, handleKey.last);

    switch (now) {
            case 0 :
                map[handleKey.x++][handleKey.y][5][0] = 1;
                createSign(handleKey.x - 1, handleKey.y, 1, 0, handleKey.distance);
                break;
            case 1 :
                map[handleKey.x][handleKey.y++][5][1] = 1;
                createSign(handleKey.x, handleKey.y - 1, 1, 1, handleKey.distance);
                break;
            case 2 :
                map[--handleKey.x][handleKey.y][5][0] = 1;
                createSign(handleKey.x, handleKey.y, 1, 0, handleKey.distance);
                break;
            case 3 :
                map[handleKey.x][--handleKey.y][5][1] = 1;
                createSign(handleKey.x, handleKey.y, 1, 1, handleKey.distance);
            default:
                break;
    }


    handleKey.last = now;
}

// Define constants
const rotationRate = 0.7;
const roadRate = 0.3;
const signRate = 1;
const board = document.getElementById('board');
const typeScale = [2, 2, 2, 4, 4, 11, 11, 1, 3, 5, 5, 2, 2, 5];

// Define variables
let level = 0;
let cols = 4;
let rows = 4;

// Add event listener
document.addEventListener('keydown', handleKey);

// Initialise map

let map = createNewMap();

regeneratePath();