/*File: wave.js, version 3.7 */
/* jshint esversion: 6, bitwise: false*/
/* globals model, getPorts, getSignals, boardSim, boardDes */
/* getCycles()		// vhdl
  isSequential()	// vhdl
  graf_init()		// html
  graf_refresh()	// html, userint
  getInValues(i)	// parsesim
  setSignal(i, name, value) // parsesim
  setSignalDump(t0, t1, a)  // userint
  dump2string()			// userint */

const RGBin = "black";
const RGBout = "blue";
const RGB = "darkblue";

let signals = []; // vrednosti signalov [][]
let inputs = [];  // indeksi vhodnih signalov
let ctx;     // kontekst platna
let ports = [];   // tabela prikljuckov, elementi razreda Sig

/* Local functions and classes
 class wave = new Wave(), setView, zoom, dx, line, cycles, setCycles, nstart, nend, qType, setqType
 
 setSignalAll()
 Sig(name, mode, type)
 Bit(name, mode)
 Vec(name, mode, type, size, qual)
 
 draw_bit(..); numToBin(numStr, size); draw_bus(..)
 graf(); graf_clear(); graf_labels();  graf_plot();
 graf_click(e)
 graf_move(e) 
*/

// ID in funkcije za branje iz vnosnih polj
const canvasID = "wave";

function Wave() {  // podatkovna struktura za grafikon, funkcije: zoom, ID=slide
  let zoomf = 1; // 100%  
  let txt = "100%";
  
  let cycles100 = 50; // ciklov pri 100%  
  let viewcycles = cycles100;
  
  let wdx = 20;   // pix/cikel
  let wline = 2;  // ciklov/pomozno crto
  
  let wcycles = 0; // vseh ciklov v signalih
  let wnstart = 0; // prvi prikazani cikel
  let wnend = 0;   // zadnji prikazani cikel
  
  let wqType = new Map();
  
  function dx() {return wdx;}
  function line() {return wline;}
  function cycles() {return wcycles;}
  function setCycles(cy) {wcycles = cy;}
  function nstart() {return wnstart;}
  function nend() {return wnend;}
  function qType(key) {return wqType.get(key);}
  function setqType(q) {wqType = q;}
  
  function setView(n) {
	  wnstart = n;
	  wnend = (wcycles-wnstart>viewcycles) ? wnstart+viewcycles : wcycles;  
  }
    
  function zoom(z) {
	
	let slide = document.getElementById('slide');
  
	switch (z) {
	  case -1: if (zoomf>-2) zoomf--; else return; break;
	  case  1: if (zoomf<3) zoomf++; else return; break;
	  default:
  	   zoomf=1; 
	   slide.value=0; 
	   wnstart=0;
	   document.getElementById("sliderAmount").innerHTML="0";
	}
	 
	switch (zoomf) {    
	    case 3: 
		  txt = "500%"; wdx=200; viewcycles=cycles100/10; wline=1; slide.step = 1;
		  break;
	    case 2: 
		  txt = "250%"; wdx=100; viewcycles=cycles100/5; wline=1; slide.step = 1;
		  break;
		case 1: 
		  txt = "100%"; wdx=40; viewcycles=cycles100/2; wline=1; slide.step = 1;
		  break;
		case -1: 
		  txt = " 25%"; wdx=10; viewcycles=cycles100*2; wline=5; slide.step = 10;
		  break;
		case -2: 
		  txt = " 12%"; wdx=5; viewcycles=cycles100*4; wline=10; slide.step = 20;
		  break;
		default: 
		  txt = " 50%"; wdx=20; viewcycles=cycles100; wline=2; slide.step = 10;
	}
	
    setView(wnstart);
	
	let k = Math.floor(wcycles/viewcycles);
	//console.log("Z: "+this.zoomf+"MAX:"+k*this.cycles);
	slide.max = wcycles-1; // 3.7 (k-1)*viewcycles;
	  
	  
	//slide.step = 5;//this.viewcycles;
	document.getElementById("zoomf").innerHTML = txt;
	graf();
 }

 return {setView, zoom, dx, line, cycles, setCycles, nstart, nend, qType, setqType};
}

let wave = new Wave();

function getCycles() {  // število ciklov
  return parseInt(document.getElementById("cycles").value);
}

function isSequential() { // sekvenčno vezje 
  if (model) {return model.getSeq();}
  return false;
//  return document.getElementById("sequential").checked;
}

function setSignalAll(i, value) {
console.log("#"+i);    
	let c = 0;
	let cycles = getCycles();
	
	for (c = 0; c < cycles; c++) signals[i][c] = value;
}

//-------------------------------------------------------

function Sig(name, mode, type) {
  this.name = name;
  this.mode = mode;
  this.type = type;
  
  this.getType = function() {return this.type;};  
  this.getSize = function() {return this.size;};
}
 
function Bit(name, mode) {
 Sig.call(this, name, mode, "std_logic");
 this.size = 1;
 
 this.str = function() { return this.name+","+this.mode+",std_logic"; };
}
 
function Vec(name, mode, type, size, qual) {
 Sig.call(this, name, mode, type);
 this.type = type;
 this.size = size;
 this.format = (qual==="") ? "d"+size : "s"+size; // V33 decimal or symbolic format
 this.qual = qual;

 if (type=="signed") {
	this.min = -Math.pow(2,Math.abs(size-1));
	this.max = Math.pow(2,Math.abs(size-1))-1;
 } else {
    this.min = 0;
	this.max = Math.pow(2,Math.abs(size))-1;
 }

 this.str = function() { return this.name+","+this.mode+","+this.type+"("+(this.size-1)+":0)"; };
} 
//-------------------------------------------------------

function graf_init() { // inicializacija, ID=slide, sliderAmount, slide.onchange()
 let canvas = document.getElementById(canvasID);
 
 canvas.addEventListener('mousemove', graf_click, false);
 canvas.addEventListener('mousedown', graf_click, false); //mousedown, mouseup
 canvas.addEventListener('mouseup', graf_click, false);
 canvas.addEventListener('keydown', graf_move);
 
 let slide = document.getElementById('slide'),
 sliderDiv = document.getElementById("sliderAmount");
 
 slide.onchange = function() {	 
	wave.setView(parseInt(this.value)); 
    sliderDiv.innerHTML = wave.nstart();
	graf();
 };

 if (canvas.getContext) {
   ctx = canvas.getContext("2d");
 } else {
   throw new Error("Can not get MyCanvas Context");
 }
 	
 //signals = [];   // removed V37a, 9.3.
 //inputs = [];
 console.log("*Graph init");
 graf_refresh();
}

function graf_refresh()  /* posodobi tabeli ports[] in signals[][], prikaz zoom(0) */
{ 
//console.log("*Refresh* call");
 	let vrstice = 0;
 	let cycles = getCycles();   // beri nove nastavitve
	
	wave.setCycles(cycles);      
	let a=0, i=0;
	
	// preveri ali so spremembe v ports[]
	let s;
	if (model===undefined) {  // get signals
		s = getPorts(true);   //   from port table
	} else {                  
		s = getSignals();     //   or from model
		wave.setqType(model.qType);
	}
	let n = 0;
	let portslen = ports.length;
	
	let change = false;  // test, if ports changed
	let modechange = false; // V37, change only port mode
	if (portslen!==s.size) {change=true; console.log("Num difference");}
	else {
	  n = 0;
	  s.forEach(function (val, id) {
		if (id!==ports[n].name) { change=true; console.log("Name difference"); }

		if (val.mode!==ports[n].mode) { modechange=true; console.log("Mode difference "+id+" "+val.mode+":"+ports[n].mode); }
		let tip_sig = "unsigned";
		if (val.type.unsigned===false) {tip_sig = "signed";}
		if (val.type.size===1) {tip_sig = "std_logic";}
		if (tip_sig!==ports[n].type) { change=true; console.log("Type difference "+tip_sig+":"+ports[n].type); }
		if (val.type.size!==ports[n].size) { change=true; console.log("Size difference "+val.type.size+":"+ports[n].size); }
		n += 1;
	  });
	  vrstice = n;  
	}	
	
	//console.log("Ports len: "+portslen+" "+change);
	
	if (change || modechange) { // define new ports
		ports = [];
		inputs = [];

		let len = 0;
    let p;
		s.forEach(function (val, id) {
			len += 1;
			let ime=id;
			let tip_sig = "unsigned";
			if (val.type.unsigned===false)  tip_sig = "signed";
			let in_out = val.mode; 
			let size = val.type.size;
			if (size===1) {p= new Bit(ime, in_out);}
			else {
                let qual = ""; // V33 determine Vec qual
                if (val.type.qual) {
                    qual = val.type.qual;                
                }                
                p = new Vec(ime, in_out, tip_sig, size, qual);
            }			
			ports.push(p);
			if (in_out==="in") {  // V37, save inputs indexes
				inputs.push(len-1);
			}
			
//setLog("Push");
//console.log("*ports*"+ime+" "+in_out);
//console.log(p);			
		});	
		vrstice = len;
        portslen = ports.length;
	}
	
	let cur_signals = signals.length;
	
	if (vrstice > cur_signals) { // dodaj vrstico signalov
		for (a=cur_signals; a < vrstice; a++) {
			signals[a] = new Array(cycles);
			for (let b=0; b < cycles; b++) signals[a][b] = 0;
		}
	}		
	if (vrstice < cur_signals) { // odstrani signale
		for (a=vrstice; a < cur_signals; a++) signals.pop();
	}
	 
	let cur_cycles;
	if (signals[0]!==undefined) {cur_cycles = signals[0].length;}
	else cur_cycles = 0;
	
	console.log("CC"+cur_cycles);
	
	if (cycles > cur_cycles) { // dodaj urne cikle
		for (a=0; a < vrstice; a++) {				
			for (i=0; i < cycles - cur_cycles; i++) signals[a].push(0);
		}
	}
	if (cycles < cur_cycles) { // odstrani cikle
		for (a=0; a < vrstice; a++) {
			for (i=0; i < cur_cycles - cycles; i++) signals[a].pop();
		}
	} 

	if (change) {
console.log("*W change");		
		for (i=0; i<portslen; i++) setSignalAll(i, 0);
	}
	
	console.log("refresh: ports="+ports.length+", cyc="+cycles);
		
	let h = 100+30*vrstice; // prilagodi velikost platna
	let canvas = document.getElementById(canvasID);
	if (vrstice >=10 && h != canvas.height) canvas.height=h; 
	
	wave.zoom(0); // prikaz pri zoom=0	
//console.log("*Refresh* "+inputs.length);	
}

/******************************************************************/
function getInValues(i) {
	let id="";
	let val=0;
	let sig = new Map();
	
	if (i >= wave.cycles()) {return undefined;}
	
	console.log("Go sim: "+i);
	
	ports.forEach(function (p, n) {		
		id = p.name;
        let ok = false;
        if (boardSim && p.mode === "in") { //V34 board support
            let index = boardDes.inNames.indexOf(ports[n].name); 
            if (index>-1) {
                val = boardDes.inValues[index];
                signals[n][i] = val;
                ok = true;
            }
        }
        
		if (i<0) {
			val = 0;
		} else if (!ok) {
			val = signals[n][i].valueOf();
		}
		if (p.mode === "in") {
			sig.set(id, val);
		}
	});

	return sig;
}

function setSignal(i, name, value) {
	ports.forEach(function (p, n) {		
		if (name===p.name) { 
		 signals[n][i] = value;
		}
	});
	
}

/******************************************************************/

function graf_clear()  // pocisti platno 
{
 let canvas = document.getElementById(canvasID);
 let context = canvas.getContext("2d");
 context.clearRect(0, 0, canvas.width, canvas.height);
}

function graf_labels()  // prikaz oznak grafikona in ure
{	
	let y1 = 60;
	
	if (isSequential()) y1 = 14;
	
	let x1 = 100; 
    let end = 70+30*ports.length; 
			
	let nstart = wave.nstart(); // zacetek in konec risanja
	let nend = wave.nend();
	let i=0;
  let n;
  
 	if (ctx) {
      if (boardSim && wave.line()===1) { // live drawing
          for (n = nstart; n < nend; n+=1) {  // risanje crt za vsak cikel
            if (n===boardDes.curCycle) {
                ctx.beginPath();            
                ctx.strokeStyle="red";
                ctx.moveTo(x1,y1);
                ctx.lineTo(x1,end);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.strokeStyle="#E9E9E9";
                ctx.moveTo(x1,y1);
                ctx.lineTo(x1,end);
                ctx.stroke();
            }
            x1 += wave.dx();
          }      
          
      } else {        
          ctx.beginPath(); 
          ctx.lineWidth = "1px";
          ctx.strokeStyle="#E9E9E9";      
          for (n = nstart; n < nend; n+=wave.line()) {  // risanje crt za vsak cikel
            ctx.moveTo(x1,y1);
            ctx.lineTo(x1,end);
            ctx.stroke();                           
            x1 += wave.line()*wave.dx();
            i += wave.line();
          }      
	  }
      
	  ctx.font = "12px Verdana"; 
	  ctx.fillStyle = "#000000";
	  ctx.textAlign="end";
      ctx.fillText("t="+100*Math.floor(nstart/100), 85, end);
			  
	  ctx.textAlign="center";
	  
	  x1 = 110;
      for (n = nstart; n < nend; n+=wave.line()) {  // stevilke ciklov na dnu diagrama
        ctx.fillText(n%100, x1, end);
        x1 += wave.line()*wave.dx();
	  }	
    } 
}
		 
function draw_bit(r, nstart, nend, vvs, vns, in_out)  /* risanje enobitnega signala */
{
  if (ctx) {
	ctx.beginPath();
	ctx.lineWidth = 1;

	if (in_out==="out" || in_out==="buffer") ctx.strokeStyle = RGBout;
	else if (in_out==="in") ctx.strokeStyle = RGBin;
	else ctx.strokeStyle = RGB;


//	ctx.strokeStyle = (in_out == "out" || in_out == "buffer") ? "blue" : "black";
        
	let xi = 100;
	let y1 = 0;
	
	for (let i = 0; i < nend-nstart; i++) {
	    y1 = (signals[r][nstart+i] == 0) ? vns : vvs;	
		if (i==0) {
			ctx.moveTo(xi + i*wave.dx(),y1);
			ctx.lineTo(xi + (i+1)*wave.dx(),y1); 
		} else {
			if (signals[r][nstart+i-1] == signals[r][nstart+i]) {
				ctx.lineTo(xi + (i+1)*wave.dx(),y1); 
			} else {
				ctx.lineTo(xi + i*wave.dx(),y1); 
				ctx.lineTo(xi + (i+1)*wave.dx(),y1); 
			}     
	    } 
    }
	ctx.stroke();
  }
}

 function numToBin(numStr, size) { // number to binary string 
 	let bin = Number(numStr);
	if (bin<0) bin = bin & ( Math.pow(2, size) - 1);
	bin = bin.toString(2);
	const numSz = bin.length;
	if (numSz <= size) {
		return bin.padStart(size, '0');
	}		
	return bin.slice(-size); // Number overflow
 }

function draw_bus(r, nstart, nend, vvs, vns, in_out, fmt)  // risanje vodila, glob. signals[][]
{ 
 if (ctx) {  
  ctx.beginPath();
  ctx.lineWidth = 1;
  
  if (in_out==="out" || in_out==="buffer") ctx.strokeStyle = RGBout;
  else if (in_out==="in") ctx.strokeStyle = RGBin;
  else ctx.strokeStyle = RGB;  
  
  
  //ctx.strokeStyle = (in_out == "out" || in_out == "buffer") ? "blue" : "black";
  if (fmt[0]==="a") {ctx.strokeStyle = "green";} // analog format
  
  let m = ports[r].max;
  let ofs = ports[r].min;
  if (ports[r].type==="signed") m = m-ports[r].min;
  
  for (let j=0; j < nend-nstart; j++) {
	  if (fmt[0]==="a") {
		  let n = ((Number(signals[r][nstart+j])-ofs)*31)/m;
		  ctx.moveTo(100 + j*wave.dx(),vns-n+5);
		  ctx.lineTo(100 + (j+1)*wave.dx(),vns-n+5);								  
	  } else {		  
	if (j == 0) {    
		ctx.moveTo(100,vvs);
		ctx.lineTo(100+wave.dx(),vvs); 
		ctx.moveTo(100,vns);
		ctx.lineTo(100+wave.dx(),vns); 
	} else {
		if (signals[r][nstart+j] != signals[r][nstart+j-1]) {
			ctx.moveTo(100+wave.dx()*j-1,vns);
			ctx.lineTo(100+wave.dx()*j+2,vvs);
			ctx.lineTo(100+wave.dx()*(j+1)-1,vvs);
			
			ctx.moveTo(100+wave.dx()*j-1,vvs);
			ctx.lineTo(100+wave.dx()*j+2,vns);
			ctx.lineTo(100+wave.dx()*(j+1)-1,vns);
		} else {         
			ctx.moveTo(100+wave.dx()*j - 1,vvs);
			ctx.lineTo(100 + wave.dx()*(j+1)-1,vvs);
			ctx.moveTo(100+wave.dx()*j-1,vns);
			ctx.lineTo(100 + wave.dx()*(j+1)-1,vns);
		}
	}
	  }
  }
  ctx.stroke();

  let first = 0;
  let value = signals[r][nstart];
  //V33 add symbolic format
  let strValue = "";
  let qa;
  switch (fmt[0]) {
    case "s": {        
        strValue = "U";
        qa = wave.qType(ports[r].qual);
        if (qa!==undefined) {strValue = qa[signals[r][nstart]];}
        break;
    }
    case "b": {
        strValue = numToBin(signals[r][nstart], fmt.slice(1)); break;
    }
    default: strValue = signals[r][nstart];
  }
  
  ctx.font = "12px Verdana"; //Vrednosti vodila na grafu
  ctx.textAlign="center";
  ctx.fillStyle = (fmt[0]==="b") ? "blue" : "black";
  
  let j;
  if (fmt[0]!=="a") {
	  for (j=1; j < nend-nstart; j++) {
		if (signals[r][nstart+j] != value) {
			if ((j-first)*wave.dx() > ctx.measureText(strValue).width) //izpis, ce je dovolj prostora		  
			  ctx.fillText(strValue, 100 + ((j-1 - first)/2)*wave.dx() + first*wave.dx() + wave.dx()/2, vns - 5);		
			value = signals[r][nstart+j];
            switch (fmt[0]) { // V33
             case "s": {
                strValue = "U";
                if (qa!==undefined) {strValue = qa[signals[r][nstart+j]];}
                break;
             }
             case "b": {
                strValue = numToBin(signals[r][nstart+j], fmt.slice(1)); break;
             }
             default: strValue = signals[r][nstart+j];
            }
			first = j;
		}
	  }
	  
	  ctx.fillText(strValue, 100 + ((j-1 - first)/2)*wave.dx() + first*wave.dx() + wave.dx()/2, vns - 5);
  }
 }
}
   
function graf_plot()  //izris vseh signalov v razpredelnici
{
  let vvs = 20;
  let vns = 40;

  let nstart = wave.nstart(); // zacetek in konec risanja
  let nend = wave.nend();
  let n;
  
  console.log("plot: "+nstart+"-"+nend);
  
  if (ctx) { 	
	if (isSequential()) { // risanje ure
		ctx.font = "15px Verdana";
		ctx.fillStyle = "gray"; //"#0000FF";
		ctx.textAlign="end";
		ctx.fillText("clk", 85, 35);
		  
		ctx.beginPath();
		ctx.strokeStyle="gray";//  "#000000";  // set the color.
		ctx.lineWidth = 2;
		let vvc = vvs; //vertikala signala visokega nivoja
		let vnc = vns; //vertikala signala nizkega nivoja
		let x1 = 100;
			
		ctx.moveTo(x1,vvc);
		
		for (n = nstart; n < nend; n++) // n-ti urni cikel
		{			
			ctx.lineTo(x1,vvc);			
			ctx.lineTo(x1+wave.dx()/2,vvc);
			ctx.lineTo(x1+wave.dx()/2,vnc);
			ctx.lineTo(x1+wave.dx(),vnc);
			x1 += wave.dx();
		}
		 ctx.stroke();
	}

	let vrstice = ports.length;
	
 	for (n=0; n < vrstice; n++) // risanje signalov
    {		
        vvs += 30;
        vns += 30;
		let m = ports[n].mode;
                
        ctx.font = "15px Verdana";  // ime signala, desna poravnava
        //ctx.fillStyle = "#0000FF";
        ctx.textAlign="end";
	    if (m==="out" || m==="buffer") ctx.fillStyle = RGBout;
	    else if (m==="in") ctx.fillStyle = RGBin;
	    else ctx.fillStyle = RGB;		
		
        ctx.fillText(ports[n].name, 85, vns - 5);
     
        // v izris posameznega signala               
        if (ports[n].type != "std_logic") {
			if (ports[n].format[0]==="a") {
				ctx.strokeStyle="lightgray";
				ctx.beginPath();
				ctx.moveTo(100, vns-12);
				ctx.lineTo(100 + (nend-nstart)*wave.dx(),vns-12);
				ctx.stroke();
			}
		}
		if (ports[n].type == "std_logic") draw_bit(n, nstart, nend, vvs, vns, ports[n].mode);        
        else draw_bus(n, nstart, nend, vvs, vns, ports[n].mode, ports[n].format); //*******
    }
	
  }
}

function graf() {  // risanje grafa
  graf_clear();    // brisanje platna
  graf_labels();   // oprema grafa
  graf_plot();     // risanje signalov
}
    
let firstClickVal = 0; // save value on mousedown	
	
// servis dogodka click, spremeni vrednost signala
function graf_click(e) { 	
	let clickType = (e.type==="mousedown") ? 1 : 0;  // mouse key down or move
	if (e.type==="mouseup") clickType = 2;
	
	if (clickType===0 && (e.buttons & 1)!==1) return;

	let rect = document.getElementById(canvasID).getBoundingClientRect(); // okvir
	let cursorX = e.clientX - rect.left;
	let cursorY = e.clientY - rect.top;
	let cx0 = Math.floor((cursorX - 100)/wave.dx());
    let cy = Math.floor((cursorY - 50)/30);
		
    let cycles = wave.cycles();
 	let vrstice = ports.length;
    let bus = parseInt(document.getElementById("bus").value);
    const autoinc = document.getElementById("autoinc").checked;
    
	let c = 0;
	
	let nstart = wave.nstart(); // zacetek in konec risanja
	let nend = wave.nend();
	
	let cx = cx0 + nstart;

	console.log("cy="+cy+" cx="+cx+",nstart="+nstart+" nend="+nend);
	
	// Click on the signal name
    if (cx0==-1 && cy>=0 && cy<vrstice) {
	  if (clickType===1 && e.button===2) { // right click to change display format
		if (ports[cy] instanceof Vec) {
			const size = ports[cy].format.slice(1);
			if (ports[cy].format[0]==="d" || ports[cy].format[0]==="s") {ports[cy].format = "b"+size;}
			else if (ports[cy].format[0]==="b") {ports[cy].format = "a"+size;}
			else {ports[cy].format = (ports[cy].qual==="") ? "d"+size : "s"+size;}
			graf();
		}
	  } else if (clickType===1 && ports[cy].mode==="in") { // left click, change all cycles
		let value=0;
		let limit=false;
		if (signals[cy][0] == 0) {
			if (ports[cy] instanceof Vec) {
				if (bus>=ports[cy].min && bus<=ports[cy].max) value = bus;
				else limit=true;
			} else value=1;
		}

		if (limit) { alert("Value out of limits!"); }
		else {	  
			let r = confirm("SET "+ports[cy].name+" = "+value+" ?"); 

			if (r == true) {
			for (c = 0; c < cycles; c++) signals[cy][c] = value;
			graf();
			}
		}		 
	  }
	} else // click on signal trace
	
	if (cx>=nstart && cx<nend && cy>=0 && cy<vrstice) {
		if (clickType===2) {
			if (autoinc && e.button===0) document.getElementById("bus").value = (bus+1>ports[cy].max) ?  ports[cy].min : bus+1;
		} else if (e.button===2) { // right click to change display format 
			if (ports[cy] instanceof Vec) {
				const size = ports[cy].format.slice(1);
				if (ports[cy].format[0]==="d" || ports[cy].format[0]==="s") {ports[cy].format = "b"+size;}
				else if (ports[cy].format[0]==="b") {ports[cy].format = "a"+size;}
				else {ports[cy].format = (ports[cy].qual==="") ? "d"+size : "s"+size;}
                //"d"+size;}
				graf();
			}		
		} else if (ports[cy].mode==="in") {  // left click, change value
			if (ports[cy] instanceof Vec)  {
				if (bus>=ports[cy].min && bus<=ports[cy].max) {
					signals[cy][cx] = bus;
                    
                    //const newval = (bus+1>ports[cy].max) ?  ports[cy].min : bus+1;
					graf();
				} else {
					alert("Value out of limits: "+ports[cy].min+" .. "+ports[cy].max);
				}
			} else {
				if (clickType===1) { // click
					if (signals[cy][cx] == 0) firstClickVal = 1;
					else firstClickVal = 0;
				}
				
				signals[cy][cx] = firstClickVal;
				graf();
			}             
		}
	}   
}

function graf_move(e) { // servis dogodka onkeydown
  let slide = document.getElementById('slide');
  if (e.key=="6" && parseInt(slide.value) < parseInt(slide.max)) {
	slide.value = parseInt(slide.value)+parseInt(slide.step);
  } else if (e.key=="4" && slide.value > 0) {
	slide.value = parseInt(slide.value)-parseInt(slide.step);
	if (parseInt(slide.value)<0) slide.value=0;		  
  } else return;
  
  wave.setView(parseInt(slide.value)); 
  document.getElementById("sliderAmount").innerHTML = wave.nstart();
  graf();	
}

/******************************************************************/

// set input signals from dump string: initial time, end time, array
// change values or set the same last value (t0-1)
function setSignalDump(t0, t1, a) {	
    let inValues = [];
	let cycles = wave.cycles();
	if (t0>cycles || t1>cycles) return;
	
  
console.log("< set "+t0+" "+t1);	
	// save previous dump values (t0-1)
	for (let j=0; j<inputs.length; j++) {
		if (t0<1) {
			inValues.push(0);
		} else {
			inValues.push(signals[inputs[j]][t0-1]);
		}
	}

	a.forEach(function (item, i) {
		if (item.length>1) {			
		   let n = item.charCodeAt(0);
		   if (n>=65 && n<90) { 
			const f = inputs.indexOf(n-65);
			if (f>=0) {		 		
			  inValues[f] = parseInt(item.substring(1));	
//console.log("<< << "+(n-65)+" "+parseInt(item.substring(1)));		   
			}
		   }
		}
    });
	
	for (let j=0; j<inputs.length; j++) {
		for (let i = t0; i<t1; i++) signals[inputs[j]][i] = inValues[j];
	}
}

// save input waveform in string dump format
function dump2string() {
 let cyc = getCycles();
 let dt = 0;
 
 let s = "/* W#"+cyc+"\n"; 
 
 let tmp = [];

//console.log("*Dump* "+cyc+" "+inputs.length);
 for (let t=0; t<cyc; t++) {
	let change = false;
	let str = "";
	
	
	for (let i=0; i < inputs.length; i++) {
	 if (t===0) { // save signal ID and value		 
	     s += String.fromCharCode(65+inputs[i])+signals[inputs[i]][t]+" ";
		 tmp[i] = signals[inputs[i]][t];
	 } else if (signals[inputs[i]][t]!==tmp[i]) {
		str += String.fromCharCode(65+inputs[i])+signals[inputs[i]][t]+" ";
		tmp[i] = signals[inputs[i]][t];
		change = true;
	 }
	}
	if (change) {
		s += "#"+dt+"\n"+str;
		dt = 0;
	}
	dt += 1;
 }
 
 s += "#"+dt+"\n*/";

 return s;
}