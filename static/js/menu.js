"use strict";

export function onWndLoad() {
   
    let slider = document.querySelector('.slider');
    let sliders = slider.children;
   
    let initX = null;
    let transX = 0;
    let transY = 0;
    let rotZ = 0;
   
    let curSlide = null;
    
    let Z_DIS = 50;
    let Y_DIS = 10;
    let TRANS_DUR = 0.4;
    let images=document.querySelectorAll('img');
    for(let i = 0; i < images.length; i++)
    {
        images[i].onmousemove=function(e){
            e.preventDefault()
        }
        images[i].ondragstart=function(e){
            return false;
        }
    }
  
    function init() {
       
        let z = 0, y = 0;

        for (let i = sliders.length - 1; i >= 0; i--) {
            sliders[i].style.transform = `translateZ(${z}px) translateY(${y}px)`;
           
            z -= Z_DIS;
            y += Y_DIS;
        }

        attachEvents(sliders[sliders.length - 1]);       
    }

    function attachEvents(elem) {
        curSlide = elem;

        curSlide.addEventListener('mousedown', slideMouseDown, false);
        curSlide.addEventListener('touchstart', slideMouseDown, false);
    }

    init();

    function slideMouseDown(e) {
    
        if (e.touches) {
            initX = e.touches[0].clientX;
        }
        else {
            initX = e.pageX;
        }

        document.addEventListener('mousemove', slideMouseMove, false);
        document.addEventListener('touchmove', slideMouseMove, false);

        document.addEventListener('mouseup', slideMouseUp, false);
        document.addEventListener('touchend', slideMouseUp, false);
    }
    let prevSlide = null;

    function slideMouseMove(e) {
        let mouseX;
      
        if (e.touches) {
            mouseX = e.touches[0].clientX;
        }
        else {
            mouseX = e.pageX;
        }

        transX += mouseX - initX;
        rotZ = transX / 20;

        transY = -Math.abs(transX / 15);
     
      
      
        curSlide.style.transition = 'none';
        curSlide.style.webkitTransform = 'translateX(' + transX + 'px)' + ' rotateZ(' + rotZ + 'deg)' + ' translateY(' + transY + 'px)';
       curSlide.style.transform = 'translateX(' + transX + 'px)' + ' rotateZ(' + rotZ + 'deg)' + ' translateY(' + transY + 'px)';
        let j = 1;
        //remains elements
         for (let i = sliders.length -2; i >= 0; i--) {

        sliders[i].style.webkitTransform = 'translateX(' + transX/(2*j) + 'px)' + ' rotateZ(' + rotZ/(2*j) + 'deg)' + ' translateY(' + (Y_DIS*j) + 'px)'+ ' translateZ(' + (-Z_DIS*j) + 'px)';
        sliders[i].style.transform = 'translateX(' + transX/(2*j) + 'px)' + ' rotateZ(' + rotZ/(2*j) + 'deg)' + ' translateY(' + (Y_DIS*j) + 'px)'+ ' translateZ(' + (-Z_DIS*j) + 'px)';
        sliders[i].style.transition = 'none';
        j++;
        }      
        
          
         
          initX =mouseX;
          e.preventDefault();
          if (Math.abs(transX) >= curSlide.offsetWidth-30) {
           
              document.removeEventListener('mousemove', slideMouseMove, false);
              document.removeEventListener('touchmove', slideMouseMove, false);
              curSlide.style.transition = 'ease 0.2s';
              curSlide.style.opacity = 0;
              prevSlide = curSlide;
              attachEvents(sliders[sliders.length - 2]);
              slideMouseUp();
              setTimeout(function () {
                 
               
                 
               
                  
                  slider.insertBefore(prevSlide, slider.firstChild);
                  
                  prevSlide.style.transition = 'none';
                  prevSlide.style.opacity = '1';
                  slideMouseUp();
                
              },201);
            
             
              
              return;
          }
    }
    function slideMouseUp() {
        transX = 0;
        rotZ = 0;
        transY = 0;
      
        curSlide.style.transition = 'cubic-bezier(0,1.95,.49,.73) '+TRANS_DUR+'s';

        curSlide.style.webkitTransform = 'translateX(' + transX + 'px)' + 'rotateZ(' + rotZ + 'deg)' + ' translateY(' + transY + 'px)';
       curSlide.style.transform = 'translateX(' + transX + 'px)' + 'rotateZ(' + rotZ + 'deg)' + ' translateY(' + transY + 'px)';
        //remains elements
        let j = 1;
        for (let i = sliders.length -  2; i >= 0; i--) {
               sliders[i].style.transition = 'cubic-bezier(0,1.95,.49,.73) ' + TRANS_DUR / (j + 0.9) + 's';
        sliders[i].style.webkitTransform = 'translateX(' + transX + 'px)' + 'rotateZ(' + rotZ + 'deg)' + ' translateY(' + (Y_DIS*j) + 'px)' + ' translateZ(' + (-Z_DIS*j) + 'px)';
           sliders[i].style.transform = 'translateX(' + transX + 'px)' + 'rotateZ(' + rotZ + 'deg)' + ' translateY(' + (Y_DIS*j) + 'px)' + ' translateZ(' + (-Z_DIS*j) + 'px)';

        j++;
        }
         
        document.removeEventListener('mousemove', slideMouseMove, false);
        document.removeEventListener('touchmove', slideMouseMove, false);
     
    }
}

export function remove() {
    
}