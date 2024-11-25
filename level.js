"use strict";

export function createLevel() {
    let level = 0;
    return {
        increment: function() {
            level++;
            this.GPA();
        },
        decrement: function() {
            if (level > 0) {
                level--;
                this.GPA();
            }
        },
        reset: function() {
            level = 0;
            this.GPA();
        },
        GPA: function() {
            const scalingFactor = 0.05;
            const maxGPA = 4.3;
            const minGPA = 1.0;
            let GPA = (minGPA + (maxGPA - minGPA) * (1 - Math.exp(-scalingFactor * level))).toFixed(2);
            document.getElementById('GPA').innerText = `GPA ${GPA}`;
        },
        size: function() {
            return [Math.floor((level) / 10 + 1.5), Math.floor((level) / 10 + 1)];
        }
    }
}