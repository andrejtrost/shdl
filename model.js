/*File: model.js,  version 3.8t */
/* 3.8, experimental Verilog support */
/*jshint esversion: 6 */
/*jslint bitwise: true */
/*global setLog, setup, vec, isComparisonOp, modelErr, modelWarn, model, resEnabled, resEst */
/*       setup.verilog */
/* Methods: common
 get(), set() - get or set object
 val() - return numeric(vector) value of num, var or op
 visit(pass, parObj) - visit the object, perform analysis, return string (log purpose)
 emitVHD() - return VHDL representation of object
 count() - count the number ob operands (var,num=1, op>=1)
 
 Output: NumConst, Slice, Var, Statement, IfStatement, Instance, Blok
 */

const log = false;
const logval = true;
const logset = true;

// util functions
// get variable object and return mode, type
function mode(v) {return v.get().mode;}
function type(v) {
	if (v.get().type===undefined) {console.log("type undefined!");}
	return v.get().type;
}
function typeToString(t) { // convert type object to string
	if (t.unsigned) {return "u"+t.size;}
	if (t.unsigned===false) {return "s"+t.size;}
	return "?"+t.size;
}
function hdl(v) { // return hdl object or default object
	let o=v.get();

	if (o.hasOwnProperty("hdl")) {return v.get().hdl;}
	return {mode:"*", assignments:0}; // mode, number of assignment, ...
}
function setHdlMode(v, mode) {
	let mode0=hdl(v).mode;

	if (mode==="in") {
		if (mode0==="" || mode0===undefined) {v.set({hdl: {mode: "in"}});}
	    else if (mode0==="out") {v.set({hdl: {mode: "inout"}});}
	} else if (mode==="out") {
		if (mode0==="" || mode0===undefined) {v.set({hdl: {mode: "out"}});}
	    else if (mode0==="in") {v.set({hdl: {mode: "inout"}});}
	}
}

function bitString(valStr, size) {  // number to VHDL binary bit string
	const bin = Number(valStr).toString(2);
	const numSz = bin.length;

	if (numSz <= size) {
		return "\""+bin.padStart(size, "0")+"\"";
	}
	return "\""+bin.slice(-size)+"\""; // Number overflow
}

 // number to VHDL/Verilog code: convert, resize, set format
 //  in: value string, type: size, unsigned and out format specifier
 function numVHD(numStr, objType, outFormat) {
	if (objType.size === undefined || objType.unsigned === undefined) {
		console.log("iErr: numVHD undefined objType!");
		return "";
	}
	const num = Number(numStr);
	const size = objType.size;
	const unsigned = objType.unsigned;

	if (size===1) {
		if (num!==0 && num!==1) {
			setLog("emitVHD: Assigned value '"+numStr+"' expected 0 or 1!");
		}
		if (setup.verilog) {return (num%2===0)? 0 : 1;}
		return (num%2===0)? "'0'" : "'1'";		
	} 
	
	if (setup.verilog) {return num;}

	if (outFormat==="b" || (outFormat==="" && size <= setup.maxBinSize)) { // output string literal
		return bitString(num, size);
	} else {
		if (unsigned) { return "to_unsigned("+num+", "+size+")"; }
		return "to_signed("+num+", "+size+")";
	}
 }


let Resource={IO:0, FF:1, BOOL:2, ARIT:3, CMP:4, MUX:5, IOID:6};

let process = (function() {    // process data
	let sensitivity = new Set([]);

	function initList() {sensitivity=new Set([]);}
	function addVar(o) {sensitivity.add(o);}
	function sensList() {
		return Array.from(sensitivity).join(",");
	}
	return {initList, addVar, sensList};
}()); // singleton


let stat = (function() {    // statistics and tmp values singleton V29
	let numIO = 0;
	let numFF = 0;
	let numBool = 0;
	let numArit = 0;
	let numCmp = 0;
	let numMux = 0;
	let io = new Set([]); // I/O variables
	let ff = new Set([]);
	let names = new Set([]); // set of variable names
	let pos = {x:0, y:0}; // model visit position
	let labels = [];

	let blockLevel;
	let blockArray;

	function init() {
		numIO = 0;
		numFF = 0;
		numBool = 0;
		numArit = 0;
		numCmp = 0;
		numMux = 0;
		io = new Set([]);
		ff = new Set([]);

		labels = [];
console.log("INIT: labels len="+labels.length);
		blockLevel = 0;
		blockArray = [0, 0];
	}

	function initNames() {names = new Set([]);}
	function addName(o) {names.add(o);}
	function getNames() {return names;}

	function blockName() {
		let str = (blockArray[0]+1);
		let i;
		for (i=1; i<=blockLevel; i+=1) {
			str += "."+(blockArray[i]+1);
		}
		return str;
	}
	function pushBlock() {
		blockLevel += 1;
		if (blockArray[blockLevel]===undefined) {blockArray[blockLevel]=0;}
	}
	function popBlock() { // check if 0!!
		if (blockLevel>0) {
			blockArray[blockLevel] += 1;
			blockArray[blockLevel+1] = 0;
			blockLevel -= 1;
		}
	}
	function getBlockLevel() { //0104
		return blockLevel;
	}

	function setPos(p) { pos = p; }
	function getPos() { return pos;}

	function addID(id, set) { // add identifier to set
		if (set===Resource.IO) {io.add(id);}
		if (set===Resource.FF) {ff.add(id);}
	}
	function getSet(set) { // get seleceted Set()
		if (set===Resource.IO) {return io;}
		if (set===Resource.FF) {return ff;}
	}

	function incNum(n, resource) {
		switch (resource) {
		 case Resource.IO: numIO += n; break;
		 case Resource.FF: numFF += n; break;
		 case Resource.BOOL: numBool += n; break;
		 case Resource.ARIT: numArit += n; break;
		 case Resource.CMP: numCmp += n; break;
		 case Resource.MUX: numMux += n; break;
		}
	}

	function emit() {
		let s = "I/O pins  : "+numIO+"<br>\n";
		s += "Flip-flops: "+numFF+"<br>\n";
		s += "Log gates: "+numBool+"<br>\n";
		s += "Arith op.: "+numArit+"<br>\n";
		s += "Comp op.: "+numCmp+"<br>\n";
		s += "Mux: "+numMux;
		return s;
	}

	return {labels, init, initNames, addName, getNames, blockName, pushBlock, popBlock, getBlockLevel, setPos, getPos, addID, getSet, incNum, emit};
}()); // singleton function call!

function NumConst(n, fmt) { "use strict";
	let num = 0;
	let value = [0, 0];
	let obj = {unsigned:true, size:0, format:fmt};
    if (resEnabled) obj.ID = resEst.nextID();

	if (n[0]==="-") {  // TODO: unary not constant
		num = Number(n.slice(1));
		const tmp = vec.op("-", vec.zero, [num, 0]);
		value = [tmp[0], tmp[1]];
		obj.size = num.toString(2).length+1;
		obj.unsigned = false;
		if (logval) {console.log("NumConst negative!");}
	} else {
		num = Number(n);
		value = [num, 0];

		if (obj.format===undefined) {obj.format="";}
		if (obj.format[0]==="b") { // TODO: hex constant size
			obj.size = Number(obj.format.slice(1));
		} else {
			obj.size = num.toString(2).length;
		}

		if (logval) {console.log("NumConst "+obj.size+" fmt:"+obj.format);}
	}

	function set(o) {  // set number type: signed/unsigned and compute size
		let logStr = "";

		if (o.hasOwnProperty("type")) {
			if (o.type.hasOwnProperty("unsigned")) {
				obj.type.unsigned = o.type.unsigned;
				if (o.type.unsigned) {obj.size = vec.out(value).toString(2).length;}
				else {obj.size = vec.out(value).toString(2).length+1;}
				logStr += " type:"+typeToString(o.type);
			}
			if (o.type.hasOwnProperty("size")) {  // set size
				obj.size = o.type.size;
				logStr += " size:"+o.type.size;
			}
		}

		if (logset) {console.log("num.set "+logStr);}
	}

	function val() {return value;}

	function get() {
		return {ID: obj.ID, type: {id:"num", unsigned:obj.unsigned, size:obj.size, format:obj.format}};
	}

    function visit(pass) {
        if (resEnabled && pass===1) {
           resEst.addNode(value[0].toString(), obj.ID, {size: obj.size, id: "num"});
        }
        return value[0].toString();
    }
	function emitVHD() {
		// check for negative value (signed numeric constant)
		if (obj.unsigned===false) {
			let c = vec.complement(value);
			return "-"+c[0].toString();
		}
		return value[0].toString();
	}
	function count() {return 1;}

	function id() {return "num"+value[0].toString();}
	return {val, get, set, visit, emitVHD, count, id};
}


function Slice(vari) {
	let variable = vari;
	let range = 0; // upper bound or -1 for index variable
	let low = 0;   // lower bound
	let size = 1;
	let mask = Object.assign({}, vec.mask(1));
	let update = false;
	let index = null;
	let bitValue = 0;
	let nextValue = 0;

	function sliceSetup(m, n) { // range(m...n)
		if (m===-1) { // new: -1 = denote variable index
			range = -1;
			size = 1; // one bit or
		    if (type(variable).qual==="array") { // variable is memory array
				size = Number(type(variable).size);
			}
			index = n;
		} else {
			range = Number(m);
			low = Number(n);
			size = range-low+1; // number of slice elements (or bits)
			if (type(variable).qual==="array") { // TODO: memory variable, slice not yet fully implemented
				size = size*Number(type(variable).size);
console.log("Warning: partial implemented memory size: "+size);	// check bounds
			}			
		}
		mask = Object.assign({}, vec.mask(size));
	}

	function val() {
		let b = low;
		let v = [0, 0];

		if (range===-1) { // get indexed value, check index TODO: report index out of range
			b = index.val()[0];
			if (type(variable).qual==="array") {
				if (b<0 || b>=type(variable).asize) {					
           throw modelErr("Array: "+variable.get().name+"("+b+") index out of bounds!");
           // b = 0;
				}
			}
			console.log("Index: "+b);
		}

		if (type(variable).qual==="array") {
			v[0] = variable.val(b)[0];
			v[1] = variable.val(b)[1];
		} else {
			v = vec.shiftRight(variable.val(), b);
		}
console.log("Slice.val "+variable.get().name+"("+b+") ="+v.toString()+" mask:"+mask[0]+","+mask[1]);
// V3.5 TODO negative
		v[0] &= mask[0];
		v[1] &= mask[1];
		
        if (type(variable).unsigned) {
		  v[0] >>>= 0;
		  v[1] >>>= 0;
	    } else {
			if (type(variable).size>32) {console.log("Signed>32 not supported!");}

			if ((v[0]&(1 <<(type(variable).size-1)))!==0) {
				v[0] = v[0] | ~mask[0];
				v[1] = 0xFFFFFFFF;
			}
	    }		
		return v;
	}

	//function setVal(v) {}  not applicable, slice is used only on expression right

	function get() { // pass the variable info, isVar=false
		let v = variable.get();
		let sliceType = Object.assign({}, v.type);
		let sliceHdl = Object.assign({}, v.hdl);

        //sliceHdl.assignments = 1; // V3.7, TODO

		sliceType.size = size;
		if (size===1) {sliceType.id="bit";}

		const o = {isVar:false, name:v.name, range:v.range, type:sliceType, hdl:sliceHdl, low:low};
		return o;
	}

	function set(o) {  // apply set to the variable, except size		
		variable.set(o);
	}

	function setNext(n) { // call variable setNext and provide index
		let idx = 0;

		if (range===-1) {  // indexed array
			idx = index.val()[0];
			update = variable.setNext(n, idx);
		} else {
			// check if not array and only one index
			
			if (range !== low) {
console.log("Error: setNext slice unsupported range!");
			} else {
				//nextValue = n;
				//if (nextValue!==bitValue) update = true;
				//else update = false;
				update = variable.setNext(n, range);
console.log("** set next val"+range+update);				
			}
		}
		return update;
	}

	function visit() {       
		stat.addName(variable.get().name);
		if (range===-1) {return variable.get().name+"("+index.get().name+")";}

		if (range===low) {return variable.get().name+"("+range+")";}

		return variable.get().name+"("+range+":"+low+")";
	}

	function emitVHD() {
		stat.addName(variable.get().name);//12.3.
        if (setup.verilog) {
            if (range===-1) {return variable.get().name+"["+index.get().name+"]";}
            if (range===low) {return variable.get().name+"["+range+"]";}
            return variable.get().name+"["+range+" : "+low+"]";
        } 
        
		if (range===-1) {
            if (type(index).size==1) {return variable.get().name+"(to_integer(unsigned'(\"\" & "+index.get().name+")))";}
            return variable.get().name+"(to_integer("+index.get().name+"))";
        }
		if (range===low) {return variable.get().name+"("+range+")";}
		return variable.get().name+"("+range+" downto "+low+")";
	}

	function count() {return 1;}

	return {val, get, set, setNext, sliceSetup, visit, emitVHD, count};
}

//V32 value = init, init:[0, 0]
//V3.7 setBits = true, if assigned by bits (hdl:bitAssignments)
function Var(varName) { "use strict";
 let obj = {isVar:true, name:varName, mode:"", type:{id:"sig", unsigned:true, size:0, declared:0, qual:"", asize:0, bits:false}, 
 mask:[0, 0], setInit:false, init:[], hdl:{bitAssignments: 0}}; // target:"" or "=" numtarget:0, 1,
 
 if (resEnabled) obj.ID = resEst.nextID();
 let value = [0, 0]; // value of variable or first element of memory array
 let memory = [];
// let bits = 0; // slice bits value
// let setBits = false;
 let nextValue = [0, 0];
 let nextIdx = 0;
 let update = false;

 function val(i) {
     if (i !== undefined) {
		 if (i>=0 && i<memory.length) {return memory[i];}
		 else {            
			console.log("Unexpected: Array read index out of range: "+i);
			return [0, 0];
		 }
	 }
	 return value;
 }

 function setVal(v) {
	//alert("name: "+obj.name);
	if (!(Array.isArray(v) && v.length===2)) {
		console.log("Var.setVal param error");
		return;
	}
	value[0] = v[0] & obj.mask[0];
	value[1] = v[1] & obj.mask[1];

	if (obj.type.unsigned) {
		value[0] >>>= 0;
		value[1] >>>= 0;
	} else {
		if (obj.size>32) {console.log("Signed>32 not supported!");}
//console.log("set size: "+obj.type.size+"S"+(value[0]&(1 <<(obj.type.size-1))));
		if ((value[0]&(1 <<(obj.type.size-1)))!==0) {
			value[0] = value[0] | ~obj.mask[0];
			value[1] = 0xFFFFFFFF;
		}
	}
	if (logset) {console.log("set value "+obj.name+"="+vec.out(value, obj.unsigned)+" 0x"+vec.hex(value));}
 }

 function get() {return obj;}

//obj = {isVar:true, name:varName, mode:"", type:{id:"sig", unsigned:true, size:0, declared:0, qual:"", asize:0}, mask:[0, 0], init:[], hdl:{}};
 function log() { //  V33 debug info
     let s = "VAR ";
     s += obj.name+" "+obj.mode;
     let u = " u";
     if (!obj.type.unsigned) {u = " s";}
     s += " {"+obj.type.id+u+obj.type.size;
     if (obj.type.qual!=="") s += " qual:"+obj.type.qual;
     
     s += " hdl{";
     if (obj.hdl.hasOwnProperty("mode")) s += obj.hdl.mode+" ";
     if (obj.hdl.hasOwnProperty("val")) s += obj.hdl.val+" ";
     s += "}}";
     return s;
 }

 function set(o) {
	let s ="";
    
	if (o.hasOwnProperty("name")) {obj.name = o.name;}
	if (o.hasOwnProperty("mode")) {obj.mode = o.mode;}

	if (o.hasOwnProperty("init")) {obj.init = o.init; s+= "init:"+o.init; obj.setInit = true;} // V33a setInit
	if (o.hasOwnProperty("bitAssignments")) {obj.hdl.bitAssignments = o.bitAssignments;} // V3.7 assign by bits

	if (o.hasOwnProperty("type")) {		
		if (o.type.hasOwnProperty("id")) {obj.type.id = o.type.id; s+=" id:"+o.type.id;}
		if (o.type.hasOwnProperty("unsigned")) {obj.type.unsigned = o.type.unsigned; s+=" u:"+o.type.unsigned;}
		if (o.type.hasOwnProperty("size")) {  // set size, compute type id and mask
			obj.type.size = o.type.size;
			if (o.type.size===1) {obj.type.id="bit";}
		    Object.assign(obj.mask, vec.mask(obj.type.size));
			s+=" size:"+o.type.size;
		}
		if (o.type.hasOwnProperty("declared")) {obj.type.declared = o.type.declared; s+=" dec:"+o.type.declared;}
		if (o.type.hasOwnProperty("qual")) {obj.type.qual = o.type.qual; s+=" qual:"+o.type.qual;}
		if (o.type.hasOwnProperty("asize")) { // set array size and initialize memory
			obj.type.asize = o.type.asize;
			let i;
			if (obj.init === undefined || obj.init.length === 0) {
				memory = [];
				for (i=0; i<obj.type.asize; i+=1) {
					memory.push([i+1, 0]);
				}
			} else {

                // V32, set value of variable or first element of memory array 
				setVal(obj.init);
                //value = [obj.init[0], obj.init[1]];
           
				for (i=0; i<obj.type.asize; i+=1) {
					if (i<obj.init.length) {                        
						memory.push(obj.init[i]);
					} else {
						memory.push([0, 0]); // set uninitialized to 0
					}
				}
				s+=" init ";
			}
			if (o.type.asize>0) {s+=" array:"+o.type.asize;}
		}
		if (o.type.hasOwnProperty("def")) {obj.type.def = o.type.def; s+=" def";}
		if (o.type.hasOwnProperty("bits")) {obj.type.bits = o.type.bits; s+=" bits";}
		if (logset) {console.log("Var.set type "+s);}
	}

	if (o.hasOwnProperty("hdl")) {
		if (o.hdl.hasOwnProperty("reg")) {obj.hdl.reg = o.hdl.reg; s+=" reg:"+o.hdl.reg;}
		if (o.hdl.hasOwnProperty("mode")) {obj.hdl.mode = o.hdl.mode; s+=" mode:"+o.hdl.mode;}
		if (o.hdl.hasOwnProperty("assignments")) {obj.hdl.assignments = o.hdl.assignments; s+=" a:"+o.hdl.assignments;}
		if (o.hdl.hasOwnProperty("assignop")) {obj.hdl.assignop = o.hdl.assignop; s+=" op"+o.hdl.assignop;}
		if (o.hdl.hasOwnProperty("assignb")) {obj.hdl.assignb = o.hdl.assignb; s+=" ab:"+o.hdl.assignb;} //0104 assignment block and else block
		if (o.hdl.hasOwnProperty("assigne")) {obj.hdl.assigne = o.hdl.assigne; s+=" ae:"+o.hdl.assigne;}
		if (o.hdl.hasOwnProperty("val")) {obj.hdl.val = o.hdl.val; s+=" v="+o.hdl.val;}
		if (o.hdl.hasOwnProperty("names")) {obj.hdl.names = o.hdl.names; s+=" names="+o.hdl.names.size;}
		if (logset) {console.log("Var.set hdl "+s);}
	}
 }

 function setNext(n, idx) { // if masked input != value, set nextValue & return true
    let needUpdate = false;
	if (!(Array.isArray(n) && n.length===2)) {
		console.log("Var.setNext "+obj.name+" param error");
		console.log(n);
		return;
	}
	if (idx!==undefined && obj.type.qual!=="array") { // V3.7 set only one bit of a vector
		if (idx>=0 && idx<32) {
//			setBits = true;
//console.log("*Next: "+obj.name+"("+idx+")="+(n[0] & 1));

			const b = (nextValue[0] & (1 << idx))===0 ? 0 : 1; //(bits & (1 << idx))===0 ? 0 : 1;
			needUpdate  = (b!==(n[0] & 1)) ? true : false; //(bits[idx]!==n[0])
			if (needUpdate) { 
             nextValue[0] = nextValue[0] ^ (1 << idx); 
             update = true;
             } // toggle bit bits = bits ^ (1 << idx);
//console.log("*Next v: "+nextValue[0]);
			return needUpdate;
		}
	} else {	// v3.7, normal var next value
		nextValue[0] = (n[0] & obj.mask[0])>>>0;
		nextValue[1] = n[1] & obj.mask[1];
		if (obj.type.unsigned===false) {
	//console.log("Sign fix");
			if (obj.type.size>32) {console.log("Signed>32 not supported!");}
			if ((nextValue[0]&(1 <<(obj.type.size-1)))!==0) {
				nextValue[0] = nextValue[0] | ~obj.mask[0];
				nextValue[1] = 0xFFFFFFFF;
			}
		}
	}
    
	//update = false;
	if (obj.type.qual==="array") {  // memory array
		if (idx>=0 && idx<obj.type.asize) {
			nextIdx = idx;
			if (nextValue[0] !== memory[idx][0] || nextValue[1] !== memory[idx][1]) {
			if (logval) {console.log("NEW next val "+obj.name+"("+idx+") = "+vec.hex(nextValue)+" m:"+vec.hex(obj.mask));}
			update = true;
            needUpdate  = true;
			} else {
				console.log("Var.setNext memory setup error");
			}
		}
	} else {
//console.log("*setNext "+obj.name+": "+value[0]+" -> "+nextValue[0]);		
		if (nextValue[0] !== value[0] || nextValue[1] !== value[1]) {
			if (logval) {console.log("NEW next val "+obj.name+" = "+vec.hex(nextValue)+" m:"+vec.hex(obj.mask));}
			update = true;
            needUpdate  = true;
		}
	}
	return needUpdate;
 }

 function next() {
     let r = false;
	 if (update) {
         if (nextValue[0] !== value[0] || nextValue[1] !== value[1]) r = true; //V37d
//console.log("*next "+value[0]+":"+nextValue[0]+" "+r);
		 if (obj.type.qual==="array") {
		    Object.assign(memory[nextIdx], nextValue); r = true;		
		 } else {
			Object.assign(value, nextValue);
		 }
		update = false;
	 }
	 return r;
 }

 function visit(pass) {
	 stat.addName(obj.name);
     
     if (pass===1) {
 //console.log("#var "+obj.name+" op: "+obj.hdl.assignop);         
        let reg=null;
        if (obj.hdl.assignop!==undefined) {
            reg=(obj.hdl.assignop==="<=") ? true : false;
        }
        if (resEnabled) {
            if (reg!==null) {
                resEst.addNode(obj.name, obj.ID, {size: obj.type.size, id: "sig", reg: reg});        
    //console.log("%N "+obj.name+" "+reg);
            } else {
                resEst.addNode(obj.name, obj.ID, {size: obj.type.size, id: "sig"});
    //console.log("%N "+obj.name);
            }
        }
     }
	 return obj.name;
 }
 
 function emitVHD() {
	 stat.addName(obj.name);
	 return obj.name;
 }
 
 function count() {return 1;}

 function id() {return "(var "+obj.name+")";}
 return {get, set, val, setVal, setNext, next, visit, emitVHD, count, log, id};
} // Var

// obj {left:null, op:"", right:null, type:{}}
function Op(o, optType) { "use strict";
 let obj = o;
 obj.type = (
	optType===undefined ? {id:"", unsigned:true, size:0, format:""} : optType
 );
 if (resEnabled) obj.ID = resEst.nextID(); // V3.6
 
 let numOperands = 0;

 function left(v)  {obj.left = v;}
 function getLeft() {return obj.left;}

 function right(v) {obj.right = v;}
 function getRight() {return obj.right;}

 function op(v)    {obj.op = v;}
 function getOp()  {return obj.op;}

 function get() {
//	console.log("Op.get type: '"+obj.type.id+"' "+obj.type.size+" "+obj.type.unsigned);
	return obj;
 }

 function set(o) {
	let s ="";

    if (o.hasOwnProperty("type")) {
		if (o.type.hasOwnProperty("id")) {obj.type.id = o.type.id; s+=" id:"+o.type.id;}
		if (o.type.hasOwnProperty("size")) {obj.type.size = o.type.size; s+=" size:"+o.type.size;}
		if (o.type.hasOwnProperty("unsigned")) {obj.type.unsigned = o.type.unsigned; s+=" u:"+o.type.unsigned;}
		if (o.type.hasOwnProperty("format")) {obj.type.format = o.type.format; s+=" f:"+o.type.format;}
		if (o.type.hasOwnProperty("bool")) {obj.type.bool = o.type.bool; s+=" b:"+o.type.bool;}
	    if (logset) {console.log("Op.set "+obj.op+" type "+s);}
	}
 }

 function val() {
	if (obj.op==="") {return obj.left.val();}
	if (obj.left===null) {
	  return vec.unary(obj.op, obj.right.val());
	}
	if (isComparisonOp(obj.op)) {
		const max = Math.max(type(obj.left).size, type(obj.right).size);
		const cmpType = {size:max, unsigned:type(obj.left).unsigned};
//console.log("Op.val Comparison size="+max);
		return vec.cmp(obj.op, obj.left.val(), obj.right.val(), cmpType);
	}
	if (obj.op===",") {
		return vec.concat(obj.left.val(), obj.right.val(), type(obj.right).size);
	}
	return vec.op(obj.op, obj.left.val(), obj.right.val());
 }

 function id() {return "["+inspect()+"]";}

 function inspect() {
	 let str="{";
	 if (obj.op==="") { // one operand
	 str += "L: "+obj.left.id(); //.constructor.name;
	 } else {	
         str+=obj.type.bool;
		 if (obj.left!==null) str += "L: "+obj.left.id()+obj.op;
		 if (obj.right!==null) str += " R: "+obj.right.id()+obj.op;
	 }
	 str +="}";
	 return str;
 }
 

 function visit(pass, parObj) { // visit op tree, set op id & return description string, V3.6
	let str = "";
	let id2 = ""; // right (second) operand id
	let no = 0;   // num of operands
	let n = 0;
    const statistics = (parObj===undefined) ? false : parObj.stat;
    //const block = (parObj===undefined) ? undefined : parObj.block;
    
//console.log("BEGIN Op.Visit: "+obj.op+" type: '"+obj.type.id+"' "+obj.type.size+" "+obj.type.unsigned);
	if (obj.op==="") {	// only one operand
        if (resEnabled && pass===1) {
          resEst.addNode("{}", obj.ID);  // TODO V3.6
        //resEst.addEdge(obj.left.get().ID, obj.ID);
        }
		str=" ";
		if (obj.left!==null) {
			if (resEnabled && pass===1) {
                resEst.addEdge(obj.left.get().ID, obj.ID);  //obj.left.get().ID, obj.ID);                
            }
			str += obj.left.visit(pass, parObj);
			no += obj.left.count();
			obj.type.id = type(obj.left).id;
		}
	} else { // operator and operands
		if (isComparisonOp(obj.op)) { // test comparison
//          const nameB= (parObj.ifName===undefined) ? "?" : parObj.ifName;            
//console.log("# cmp.visit1 '"+obj.op+"' "+pass+" B: "+nameB);
			if (obj.left===null || obj.right===null) {
				console.log("op.visit: Unexpected empty comparison!");
			} else {
				// check if compare sig of same type and different size or sign
				if (type(obj.left).id === "sig" && type(obj.right).id === "sig") {
//console.log("cmp.visit2 "+type(obj.left).size+" r:"+type(obj.right).size);
					if (type(obj.left).size !== type(obj.right).size) {  // illegal diff size
						throw modelErr("cmpsz", "", stat.getPos());
					}
					if (type(obj.left).unsigned !== type(obj.right).unsigned) { // Illegal signed/unsigned
						throw modelErr("cmpm", "", stat.getPos());
					}
				} else if (type(obj.right).id === "num") { // compare to number
					if (type(obj.left).size===1) {
						n = Number(vec.out(obj.right.val()));
						if (n!==0 && n!==1) {
							throw modelErr("cmpb", "", stat.getPos());
						}
					}
					if (type(obj.left).unsigned && !type(obj.right).unsigned) { // illegal unsigned to signed num
						throw modelErr("cmpm", "", stat.getPos());
					}

				} else if (type(obj.left).id === "num") {
					if (type(obj.right).size===1) {
						n = Number(vec.out(obj.left.val()));
						if (n!==0 && n!==1) {
							throw modelErr("cmpb", "", stat.getPos());
						}
					}
					if (!type(obj.left).unsigned && type(obj.right).unsigned) { // illegal signed num to unsigned
						throw modelErr("cmpm", "", stat.getPos());
					}
				}
			}
		}

		str = "(";
		if (obj.left!==null) { // visit left
			str += obj.left.visit(pass, parObj);
			no += obj.left.count();
			obj.type.id = type(obj.left).id;  // get ID from left
		}
		str += " "+obj.op+" ";
		if (obj.right!==null) { // visit right
			str += obj.right.visit(pass, parObj);
			no += obj.right.count();
			id2 = type(obj.right).id;
			if (obj.type.id==="") { // get ID from right
				obj.type.id = id2;			
			} else { // get ID from both
				if (obj.type.id!==id2) { // (x,sig)->sig else (x,bit)->bit else ->num
					if (id2==="sig") {obj.type.id = "sig";}
					else if (id2==="bit") {
						if (obj.type.id==="bit" || obj.type.id==="num") {obj.type.id = "bit";}
					} else if (id2==="num") {						
						obj.type.id = obj.type.id;
					} else {console.log("Op.visit unexpected type id! "+id2);}
				}
                if (obj.op===",") {obj.type.id = "sig";} // V33 TODO
			/*	if (obj.op===",") {obj.type.id = "sig";} // TODO: check NUM*/
				if (isComparisonOp(obj.op)) {obj.type.id = "bit";} // Compare is allways type: bit	
			}
		}
		str += ")";
		if (statistics===true) { // compute operation statistics        
			str += " type: "+obj.type.id+" "+typeToString(obj.type);
			if (obj.op==="&" || obj.op==="|" || obj.op==="^" || obj.op==="~") {
				stat.incNum(obj.type.size, Resource.BOOL);
			} else if (obj.op==="+" || obj.op==="-" || obj.op==="*") {
				stat.incNum(1, Resource.ARIT);
			} else if (isComparisonOp(obj.op)) {
				stat.incNum(1, Resource.CMP);
			}    
		}
        if (resEnabled && pass===1) {  // TODO V3.6        
//setLog("/"+obj.op+obj.name); 
            if (isComparisonOp(obj.op)) { // test comparison
                const nameB= (parObj.ifName===undefined) ? "?" : parObj.ifName;
                resEst.addNode(obj.op, obj.ID, {block: nameB});
            } else {
                resEst.addNode(obj.op, obj.ID, {size: obj.type.size, id: obj.type.id});                
            }
            
            if (obj.left!==null) resEst.addEdge(obj.left.get().ID, obj.ID);
            if (obj.right!==null) resEst.addEdge(obj.right.get().ID, obj.ID);
            
var resStr = "N("+obj.op+" "+obj.ID+")";
    if (obj.left!==null) resStr += "["+obj.left.get().ID+","+obj.ID+"]";
    if (obj.right!==null) resStr += "["+obj.right.get().ID+","+obj.ID+"]";
    
//str+obj.type.id+" "+typeToString(obj.type);
//alert("Visit: "+pass+" "+resStr);            
        }
	}
	numOperands = no;
console.log("END Op.Visit: "+obj.op+" type: '"+obj.type.id+"' "+obj.type.size+" "+obj.type.unsigned+" num"+no);
/*let nt=" LT ";
if (obj.left!==null) nt += type(obj.left).id+type(obj.left).size;
if (obj.right!==null) nt += " RT "+type(obj.right).id+type(obj.right).size;
console.log("*Op: "+obj.op+" type "+obj.type.id+" NT "+nt);*/
	return str;
 }

 function resizeExp(expstr, newsize, oldsize) { // resize expression
    if (newsize === oldsize) {return expstr;}
	if (Number(oldsize)===1) {return "(0 => "+expstr+", others => '0')";} 
	if (Number(newsize)===1) {return "("+expstr+")(0)";}
	return "resize("+expstr+", "+newsize+")";
 }

 function resizeVar(str, newsize, oldsize) {  // resize sig or bit
    if (newsize === oldsize) {return str;}
	if (Number(oldsize)===1) {return "(0 => "+str+", others => '0')";}
	if (Number(newsize)===1) {return str+"(0)";}
	return "resize("+str+","+newsize+")";
 }

 function sigSign(obj, unsigned) {   // convert sig to unsigned/signed
	if (unsigned && !type(obj).unsigned) {return "unsigned("+obj.emitVHD()+")";} 
	if (!unsigned && type(obj).unsigned) {return "signed("+obj.emitVHD()+")";}
	return obj.emitVHD();
 }

 function emitVHD() {
	let str = "";
	let numStr = "";
	let numType = null;
	let bitStr = "";
	let exp = "";
	let opStr = "";
	let lt = null;
	let rt = null;
	let num = 0;

	if (setup.verilog) {
		if (obj.op==="") {	// only one operand        
			str += obj.left.emitVHD();
		} else { // operator and operands
			str = (obj.op===",")? "{" : "("; // use { for concatenation operand
			if (obj.left!==null) { // visit left
				str += obj.left.emitVHD();			
			}
			str += " "+obj.op+" ";
			if (obj.right!==null) { // visit right
				str += obj.right.emitVHD();
			}
			str += (obj.op===",")? "}" : ")";
		}
		return str;
	}


	if (obj.op==="") {  // single operand, check operand & op data type
		str="";
		if (obj.left!==null) {
			console.log("A1 "+type(obj.left).size+" "+obj.type.size);
			if (type(obj.left).size !== obj.type.size) { // left size <> op size, set by Statement.visit (NOTE)
                // check if numeric variable
				if (type(obj.left).id==="num") {
					str += obj.left.emitVHD();
			    } else {
					str += resizeVar(obj.left.emitVHD(), obj.type.size, type(obj.left).size);
				}
			} else {
				str += obj.left.emitVHD();
			}
			if (type(obj.left).unsigned !== obj.type.unsigned) {console.log("op.emit Unexpected different SIGN!");}
		}
	} else {
		opStr = obj.op;  // set operation string
		switch(opStr) {
			case "~": opStr = "not"; break;
			case "+":
			case "-": opStr = opStr; break;
			case "*": opStr = opStr; break;
			case "&":
			case "&&": opStr = "and"; break;
			case "|":
			case "||": opStr = "or"; break;
			case "^":  opStr ="xor"; break;
            case "~^":  opStr ="xnor"; break;
            case "<<": opStr ="sll"; break;
            case ">>": opStr ="srl"; break;
			case "==": opStr = "="; break;
			case "!=": opStr = "/="; break;
			case "<": opStr = "<"; break;
			case "<=": opStr = "<="; break;
			case ">": opStr = ">"; break;
			case ">=": opStr = ">="; break;
			case ",": opStr = "&"; break;
			default: console.log("on.emitVHD: unknown operation!");
		}

		if (obj.left === null) { // unary op (minus, not)
            rt = type(obj.right);
//console.log("Op.emit1 "+obj.type.id+" "+" "+opStr+" "+rt.id+rt.size);
            if (rt.id==="num") {
                let compVal = val();
                const compMask = Object.assign({}, vec.mask(obj.type.size));
                compVal[0] = (compVal[0] & compMask[0])>>>0;
                compVal[1] = compVal[1] & compMask[1];
                
                str = vec.out(compVal);
//console.log(compVal);                
            } else if (rt.id==="bit") {
              str = opStr+" "+resizeVar(obj.right.emitVHD(), obj.type.size, rt.size);    
            } else if (rt.id==="sig") {
              str = opStr+" "+resizeVar(obj.right.emitVHD(), obj.type.size, rt.size);
            } else {
              str = opStr+" "+obj.right.emitVHD();
            }

		} else if ((obj.left!==null) && (obj.right!==null)) {  // binary op, get size & op
			lt = type(obj.left);
			rt = type(obj.right);
//console.log("Op.emit2 "+obj.type.id+" "+lt.id+lt.size+" "+opStr+" "+rt.id+rt.size);			

 			// Emit code for comparison operator
			if (isComparisonOp(obj.op)) { // handle comparison			
				if ((lt.id==="bit") && (rt.id==="num")) {
					return "("+obj.left.emitVHD()+" "+opStr+" '"+obj.right.emitVHD()+"')";
				} else if ((lt.id==="num") && (rt.id==="bit")) {
					return "('"+obj.left.emitVHD()+"' "+opStr+" "+obj.right.emitVHD()+")";
				} else {
					return "("+obj.left.emitVHD()+" "+opStr+" "+obj.right.emitVHD()+")";
				}
			}
			
			// Emit expression code
			str = "(";
			if (lt.id==="num") {
				if (rt.id==="num") { // 1A
					return vec.out(val());  // return calculated value, TODO: check size !
					}
				if (rt.id==="bit") { // 1B 
                    if (opStr==="&") {  // V33 operator & extends op size¸
                       numType = {size:type(obj.left).size, unsigned:obj.type.unsigned};
                       exp = numVHD(Number(obj.left.emitVHD()),numType,"")+" "+opStr+" "+obj.right.emitVHD();
                       str += resizeVar(exp, obj.type.size, type(obj.left).size+1);
                    } else { 
                        num = Number(obj.left.emitVHD());
                        if (num!==0 && num!==1) {setLog("emitVHD: Expression number expected 0 or 1!");}
                        if (num%2===0) {exp = "'0' "+opStr+" "+obj.right.emitVHD();}
                        else {exp = "'1' "+opStr+" "+obj.right.emitVHD();}

                        str += resizeVar(exp, obj.type.size, 1); // TODO: resie EXP, test!
                    }
				} else if (rt.id==="sig") { // 1C
					if (opStr==="&") {
						if (lt.size===1) { // single bit
							numStr = "'"+obj.left.emitVHD()+"'";
						} else {
							numType = {size:type(obj.left).size, unsigned:obj.type.unsigned};
							numStr = numVHD(obj.left.emitVHD(), numType, "");
						}
						exp = numStr+" "+opStr+" "+obj.right.emitVHD();
						if (lt.size+rt.size !== obj.type.size) {
							str += resizeVar(exp, obj.type.size, 2);
						} else {
							str += exp;
						}
					} else if (opStr==="+" || opStr==="-") {  // sig +/- num (numStr = integer)
						numStr = obj.left.emitVHD();
						if (obj.type.size === rt.size) {
							str += numStr+" "+opStr+" "+obj.right.emitVHD();
						} else {  // resize only sig
							str += numStr+" "+opStr+" resize("+obj.right.emitVHD()+","+(obj.type.size)+")";
						}
					} else if (opStr==="*") {						
					    if (rt.size < lt.size) { // check number of bits in constant V3.7t !!
							str += obj.left.emitVHD()+" * resize("+obj.right.emitVHD()+","+lt.size+")";
						} else {
							str += obj.left.emitVHD()+" "+opStr+" "+obj.right.emitVHD();
						}
						//str += obj.left.emitVHD()+" "+opStr+" "+obj.right.emitVHD();
					} else {
						numStr = numVHD(obj.left.emitVHD(), obj.type, "");
						exp = numStr+" "+opStr+" "+obj.right.emitVHD();
						if (rt.size === obj.type.size) {
							str += numStr+" "+opStr+" "+obj.right.emitVHD();
						} else {
							str += numStr+" "+opStr+" resize("+obj.right.emitVHD()+", "+obj.type.size+")";
						}
					}
				} else {
					console.log("op.emitVHD 1");
				}
			} else if (lt.id==="bit") {
				if (rt.id==="num") {  // 2A
                    if (opStr==="&") {  // V33 operator & extends op size¸
                       numType = {size:type(obj.right).size, unsigned:obj.type.unsigned};
                       exp = obj.left.emitVHD()+" "+opStr+" "+numVHD(Number(obj.right.emitVHD()),numType,"");
                       str += resizeVar(exp, obj.type.size, type(obj.right).size+1);
                    } else {
                       num = Number(obj.right.emitVHD());
                       if (num!==0 && num!==1) {setLog("emitVHD: Expression number expected 0 or 1!");}
                       if (num%2===0) {exp = obj.left.emitVHD()+" "+opStr+" '0'";}
                       else {exp = obj.left.emitVHD()+" "+opStr+" '1'";}

                       str += resizeVar(exp, obj.type.size, 1);
                    }
				} else if (rt.id==="bit") { // 2B
					exp = obj.left.emitVHD()+" "+opStr+" "+obj.right.emitVHD();
					if (opStr==="&") {
						if (lt.size+rt.size !== obj.type.size) {
							str += resizeVar(exp, obj.type.size, 2);
						} else {
							str += exp;
						}
					} else {
						str += resizeVar(exp, obj.type.size, 1);
					}
				} else if (rt.id==="sig") { // 2C
					if (opStr==="&") {
						exp = obj.left.emitVHD()+" "+opStr+" "+obj.right.emitVHD();
						if (lt.size+rt.size !== obj.type.size) {
							str += resizeVar(exp, obj.type.size, 2);
						} else {
							str += exp;
						}
					} else {
						if (opStr==="+" || opStr==="-") { // special for arithmetic op
							if (rt.unsigned) { // V33a 3x popravil str+= zamenjal z exp=
								exp =  "unsigned'(\"\" & "+obj.left.emitVHD()+") "+opStr+" "+obj.right.emitVHD();
							} else {
								exp =  "signed'(\"\" & "+obj.left.emitVHD()+") "+opStr+" "+obj.right.emitVHD();
							}
						} else if (opStr==="*") { // special for arithmetic op
							exp = "(0 to "+(Number(rt.size)-1)+" => "+obj.left.emitVHD()+") and "+obj.right.emitVHD();

						} else { // use aggregate for signed & unsigned                       
                            if (Number(rt.size)===2) { // V33a u1 op u2
                                exp = "('0' & "+obj.left.emitVHD()+") "+
                                opStr+" "+obj.right.emitVHD();
                            } else {
                                exp = "(0=>"+obj.left.emitVHD()+", ("+(Number(rt.size)-1)+" downto 1)=>'0') "+
                                opStr+" "+obj.right.emitVHD();
                            }
                        
							
						}

						if (rt.size === obj.type.size) {
							str += exp;
						} else {
						   str += resizeVar(exp, obj.type.size, 2);
						}
					}
				} else {
					console.log("op.emitVHD 2");
				}
			} else if (lt.id==="sig") {
				if (rt.id==="num") {  // 3A check if operation is possible (+,-, or, ...)
					if (opStr==="&") {
						if (rt.size===1) { // single bit
							numStr = "'"+obj.right.emitVHD()+"'";
						} else {
							numType = {size:type(obj.right).size, unsigned:obj.type.unsigned};
							numStr = numVHD(obj.right.emitVHD(), numType, "");
						}
						exp = obj.left.emitVHD()+" "+opStr+" "+numStr;
						if (lt.size+rt.size !== obj.type.size) {
							str += resizeVar(exp, obj.type.size, 2);
						} else {
							str += exp;
						}
					} else if (opStr==="+" || opStr==="-") {  // sig +/- num = integer
						numStr = obj.right.emitVHD();
						if (obj.type.size === lt.size) {
							str += obj.left.emitVHD()+" "+opStr+" "+numStr;
						} else {  // resize only sig
							str += "resize("+obj.left.emitVHD()+","+(obj.type.size)+") "+opStr+" "+numStr;
						}
					} else if (opStr==="*") {  // sig * num = integer, check number of bits V3.7t !!
					    if (lt.size < rt.size) {
							str += "resize("+obj.left.emitVHD()+","+rt.size+")* "+obj.right.emitVHD();
						} else {
							str += obj.left.emitVHD()+" "+opStr+" "+obj.right.emitVHD();
						}
						
					} else if (opStr==="sll") {
                        str += "shift_left("+obj.left.emitVHD()+","+obj.right.emitVHD()+")";
					} else if (opStr==="srl") {
                        str += "shift_right("+obj.left.emitVHD()+","+obj.right.emitVHD()+")";
					} else {
						numStr = numVHD(obj.right.emitVHD(), obj.type, "");
						if (obj.type.size === lt.size) {
							str += obj.left.emitVHD()+" "+opStr+" "+numStr;
						} else {
							str += "resize("+obj.left.emitVHD()+", "+obj.type.size+") "+opStr+" "+numStr;
						}
					}
				} else if (rt.id==="bit") { // 3B  OK
					if (opStr==="&") {
						exp = obj.left.emitVHD()+" "+opStr+" "+obj.right.emitVHD();
						if (lt.size+rt.size !== obj.type.size) {
							str += resizeVar(exp, obj.type.size, 2);
						} else {
							str += exp;
						}
					} else if (opStr==="+" || opStr==="-") { // special for arithmetic op
						if (lt.unsigned) {
							bitStr = " unsigned'(\"\" & "+obj.right.emitVHD()+")";
						} else {
							bitStr = " signed'(\"\" & "+obj.right.emitVHD()+")";
						}

						if (lt.size === obj.type.size) {
							str += obj.left.emitVHD()+" "+opStr+bitStr;
						} else {
							str += resizeVar(obj.left.emitVHD(), obj.type.size, 2)+" "+opStr+bitStr;
						}
					} else if (opStr==="*") { // special for arithmetic op
						str += obj.left.emitVHD()+" and (0 to "+(Number(lt.size)-1)+" => "+obj.right.emitVHD()+")";
					} else { // use aggregate for signed & unsigned
						exp = obj.left.emitVHD()+" "+opStr+" (0=>"+obj.right.emitVHD()+", ("+(Number(lt.size)-1)+" downto 1)=>'0')";

						if (lt.size === obj.type.size) {
							str += exp;
						} else {
							str += resizeVar(exp, obj.type.size, 2);
						}
					}
				} else if (rt.id==="sig") {  // 3C
					// check +/- for carry (resize one )
					if ((opStr==="+" || opStr==="-") && (obj.type.size > Math.max(lt.size, rt.size))) {
						str += resizeVar(obj.left.emitVHD(), obj.type.size, lt.size)+" "+opStr+" "+
							   resizeVar(obj.right.emitVHD(), obj.type.size, rt.size);
					} else if (opStr==="*") {
						str += resizeVar(obj.left.emitVHD()+opStr+obj.right.emitVHD(), obj.type.size, lt.size+rt.size);
                    } else if (opStr==="sll") {  // V34b sll shifter
						str += "shift_left("+obj.left.emitVHD()+", to_integer("+obj.right.emitVHD()+"))";
                    } else if (opStr==="srl") {  // V34b sll shifter
						str += "shift_right("+obj.left.emitVHD()+", to_integer("+obj.right.emitVHD()+"))";                        
					} else if (opStr==="&") {
						//exp = obj.left.emitVHD()+" "+opStr+" "+obj.right.emitVHD();
						exp = sigSign(obj.left,obj.type.unsigned)+" "+opStr+" "+
							  sigSign(obj.right,obj.type.unsigned);
console.log("Exp: "+exp+"L:"+lt.size+lt.unsigned+" R:"+rt.size+rt.unsigned+" Obj:"+obj.type.size);
						if (lt.size+rt.size !== obj.type.size) {
							str += resizeVar(exp, obj.type.size, 2);
						} else {
							str += exp;
						}

					} else {
console.log("sig-sig L-R:"+lt.size+"-"+rt.size+" obj"+obj.type.size);
						let tmpSize = lt.size;
						if (lt.size === rt.size) {  // resize operand ?
							exp = obj.left.emitVHD()+" "+opStr+" "+obj.right.emitVHD();
						} else if (lt.size < rt.size) {
							tmpSize = rt.size;
							exp = resizeVar(obj.left.emitVHD(), rt.size, lt.size)+" "+opStr+" "+obj.right.emitVHD();
						} else {
							exp += obj.left.emitVHD()+" "+opStr+" "+resizeVar(obj.right.emitVHD(), lt.size, rt.size);
						}

						if (tmpSize === obj.type.size) {
							str += exp;
						} else {
							str += resizeExp(exp, obj.type.size, tmpSize); // 25.1. correct for 2 bits
						}
					}
				} else {
					console.log("op.emitVHD 2");
				}

			} else {
					console.log("op.emitVHD 5");
			}
			str += ")";
		}
	}
console.log("%op: '"+str+"'");
	return str;
 }

 function count() {
	 return numOperands;
 }

 return {obj, get, set, val, left, getLeft, right, getRight, op, getOp, visit, emitVHD, count, id, inspect};
}

/* assignment statement: target = var, expr = expression */
function Statement(t) {  "use strict";
	let obj = {id: t, target: null, expr: null, translated: false, level:0, pos:{x:0, y:0}, elsif: 0};

	function get() {
		return obj;
	}

	function set(o) {
		let opStr="";
		if (o.hasOwnProperty("translated")) {obj.translated = o.translated; opStr+="translated:"+o.translated;}
		if (o.hasOwnProperty("level")) {obj.level = o.level; opStr+="level:"+o.level;}
		if (o.hasOwnProperty("pos")) {obj.pos = o.pos;}
		if (o.hasOwnProperty("combProc")) {obj.combProc = o.combProc; opStr+=" cp:"+o.combProc;}
		if (o.hasOwnProperty("seqProc")) {obj.seqProc = o.seqProc; opStr+=" sp:"+o.seqProc;}
		if (logset) {console.log("Statement.set "+obj.id+opStr);}
	}

	function setExpr(e) {
		obj.expr = e;
	}

	function setTarget(d) {
		obj.target = d;
	}

	function val(firstCycle, numCycle) {
		let change = false;

		if (obj.id==="=" || (firstCycle && numCycle>0 && (obj.id==="<="))) { // AT 4.12.
			let res = obj.expr.val();
			if (logval) {
				console.log("St.val "+obj.target.get().name+" = "+vec.hex(res)+", old:"+vec.hex(obj.target.val()));
			}

			change = obj.target.setNext(res);  // true, if value changed

			return change;
		}
		return false;
	}

	function visit(pass, parObj) {  // Statement.visit	
        const vars=(parObj===undefined) ? undefined : parObj.vars;
        const block=(parObj===undefined) ? undefined :parObj.block;

		let bname = "";
		let str = " ".repeat(Number(block.level)); // output spaces
		let assignments = 0;
		if (log) {console.log("Statement.visit: "+pass+" bck="+block.name);}

        if (pass===1) { // first pass, indentify number & type of assignments, count operands		  
            if (obj.id==="<=") {stat.addID(obj.target.get().name, Resource.FF);} // save id

            let assignop = hdl(obj.target).assignop;
            if ((assignop==="=" && obj.id==="<=") || (assignop==="<=" && obj.id==="=")) {
                throw modelErr("mix", "", stat.getPos()); //Mixed comb and sequential assignments!
            }

            assignments = hdl(obj.target).assignments;
            if (assignments===undefined) {assignments=0;}
//obj.target.set({hdl: {assignments:1, assignop:obj.id}});
			if (obj.target.get().isVar===false) { // V3.7 count number in bit slice assignments
				let n = obj.target.get().hdl.bitAssignments;
				let low = obj.target.get().low;
				
                const b0 = ((n & (1<< low))===0) ? 0 : 1;
                
                if (b0===1) {
                    obj.target.set({hdl: {assignments:2, assignop:obj.id}});
                    console.log("bbb: ");
                } else {
                    obj.target.set({hdl: {assignments:1, assignop:obj.id}});
                    let b=n | (1<< low);
                    console.log("bb: "+b);
                    obj.target.set({bitAssignments: b});
                }
//alert(obj.target.get().name+" "+low);
			} else {
                obj.target.set({hdl: {assignments:assignments+1, assignop:obj.id}});
            }

            //setLog("Visit: "+block.name); //0104
            if (block.name==="1") { // first level block
                if (hdl(obj.target).assignb === undefined && hdl(obj.target).assigne === undefined) {
                    obj.target.set({hdl: {assignb:block.name}});
                } else {
					if (obj.target.get().isVar!==false) { //V3.7
						setLog(modelWarn("Statement overrides previous assignment!",obj.pos));	// Warn unconditional override
					}
                    obj.target.set({hdl: {assignb:block.name}});
                }
            } else { // next level blocks
                //setLog(block.name+" var "+obj.target.get().name);
                if (block.name.slice(-1)==="e") { // else block
                    if (hdl(obj.target).assignb === undefined) {  // test assignment block
                        obj.target.set({hdl: {assigne:block.name}});
                    } else {
                        bname = hdl(obj.target).assigne;
                        if (bname===undefined || block.name.length <= bname.length) { // save lowest block
                            obj.target.set({hdl: {assigne:block.name}});
                        }
                    }
                } else {
                    if (hdl(obj.target).assignb === undefined) {  // test assignment block
                        obj.target.set({hdl: {assignb:block.name}});
                    } else {
                        bname = hdl(obj.target).assignb;
                        if (block.name.length <= bname.length) { // save lowest block
                            obj.target.set({hdl: {assignb:block.name}});
                        }
                    }
                }
            }

            str += obj.target.visit(pass, {stat: false})+" "+obj.id+" "; // visit target, set mode=out
            
            if (resEnabled && block.name.length>1) {
console.log("# Visit target "+obj.target.get().name+"block: "+block.name);
            resEst.node2block(obj.target.get().ID, block.name); // V3.6

                
            }
            
            
            setHdlMode(obj.target, "out");         

            if (obj.expr === null) {str+="?";}
            else {
                stat.initNames();
                str += obj.expr.visit(pass, {stat: false});  // visit expression, count operands, set var mode = in

                let nameSet = new Set([]);
                if (obj.target.get().hdl.hasOwnProperty("names")) { // get existing names
                    nameSet = obj.target.get().hdl.names;
                }
                stat.getNames().forEach(function (id) {
                    setHdlMode(vars.get(id), "in"); // set HDL to IN
                    nameSet.add(id);                // add ID to current name set
                });

                obj.target.set({hdl: {names: nameSet}}); // add set of names to target
            }

            if (type(obj.target).size !== type(obj.expr).size) {  // NOTE: Resize assignment, correct expr op
                if (isComparisonOp(obj.expr.getOp())) {
                    if (log) {console.log("Statement.visit: size difference comparisson");}
                } else if (obj.expr.getOp()==="*" || obj.expr.getOp()==="<<"){
                    if (log) {console.log("Statement.visit: size difference multiplication/shift");}
                } else {
                    if (log) {console.log("Statement.visit: size difference "+type(obj.target).size+" "+type(obj.expr).size);}
                    obj.expr.set({type: {size: type(obj.target).size}});
                }
            }
            if (resEnabled) {
                const arrow=(obj.id==="<=") ? "-":"to";
                resEst.addEdge(obj.expr.get().ID, obj.target.get().ID, {arrow: arrow}); // V3.6
            }
        } else {  // second pass
            //0104
            if (obj.id==="=") {
                if (hdl(obj.target).assignb === undefined) { // only defined in else!
                    setLog(modelWarn("Uncomplete assignment (else) creates latch!",obj.pos));
                } else {
                    //setLog(hdl(obj.target).assignb+", "+hdl(obj.target).assigne);
                    if (hdl(obj.target).assignb.length>1 && hdl(obj.target).assigne === undefined) {
                        setLog(modelWarn("Uncomplete assignment creates latch!",obj.pos));
                    }
                }
            }

            if (obj.expr.count()===1) {  // single assignment to num => constant
                if ((type(obj.expr).id==="num") && (hdl(obj.target).assignments===1) && (hdl(obj.target).assignop==="=")
                    && (mode(obj.target)!=="out") && (hdl(obj.target).assignb==="1")) { // constant def. in main block
					if (obj.target.get().isVar===true) { // do not transform slice to constant
                      if (type(obj.target).unsigned && !type(obj.expr).unsigned) { // signed num to unsigned const
                        const mask = vec.mask(type(obj.target).size);
                        obj.target.set({hdl: {mode:"const", val:(obj.expr.val()[0] & mask[0])}});
                      } else {
                        obj.target.set({hdl: {mode:"const", val:vec.out(obj.expr.val())}});
                      }
                      obj.translated = true;// exclude from translation to VHDL statements
					}
                }
            }
            // out signal used as inout
            if (!setup.verilog && mode(obj.target)==="out" && hdl(obj.target).mode==="inout") {
                const old = obj.target;

                old.set({hdl: {mode: "out"}});

                let oldName = obj.target.get().name;
                const tip = type(obj.target);

                let newname = oldName + "_sig";

                obj.target.set({name: newname, mode: ""}); // rename x > xsig, mode = int. signal

                const v = model.getVar(newname);  // new var x, copy type, mode = out
                v.set({name: oldName, mode: "out", type: tip});
                v.set({hdl: {assignments: 1}});
                const st = new Statement("=");
                let op = new Op({op:"", left:obj.target, right:null});
                op.set({type: type(old)});

                st.setTarget(v);
                st.setExpr(op);
                model.push(st);
            }
        }

		return str;
	}

    // output VHD code of assignment expression
	function emitExpr(isComb) {
		let str = "";
		let expStr = "";
        if (obj.expr === null) {return "?";} // unexpected empty expression

        stat.initNames(); //12.3.
        expStr = obj.expr.emitVHD();
        stat.getNames().forEach(function (id) { // add comb expression vars to sensitivity list			 
            let v1 = model.getVar(id, true);
            if (v1!==undefined && hdl(v1).mode!=="const" && obj.id==="=" && isComb) { process.addVar(id); }
        });

        let lsz = type(obj.target).size;
        let rsz = type(obj.expr).size;
console.log("St.emit left:"+lsz+" r:"+rsz);
        if (obj.expr.count()===1) { // single item assignment (num, sig or bit)
            let v = null;
            if (obj.expr.getOp()==="") {
                v = obj.expr.getLeft();
            } else {
                v = obj.expr.getRight(); // TODO resolve unary op, unary - only for signed !!
            }

            if (type(v).id==="num") { // special code for number assignment
                    const fmt=(
                        type(v).format===undefined ? "" : type(v).format[0]
                    );
                    str += numVHD(expStr, type(obj.target), fmt);
                    // TODO: check signed value to unsigned target
            } else {
                if (lsz!==rsz) {   // signal, different size
                    if (lsz===1) { // bit <- sig
                        expStr += "(0)";
                    } else if (type(v).id==="bit") { // sig <- bit
                        expStr = "(0 => "+expStr+", others => '0')";
                    } else { // sig <- sig
                        expStr = "resize("+expStr+","+lsz+")";
                    }
                }

                if (type(obj.target).unsigned && !type(obj.expr).unsigned) {
                    str += "unsigned("+expStr+")";
                } else if (!type(obj.target).unsigned && type(obj.expr).unsigned) {
                    str += "signed("+expStr+")";
                } else {
                    str += expStr;
                }
            }
            // 25.1. Check - do not slice ()
        } else { // expression assignment
            if (type(obj.expr).id==="num") { // special code for number assignment
                    str += numVHD(expStr, type(obj.target), "d");
            } else {
                if (lsz!==rsz) { // TODO 1 bit !
                    // if lsz = 1 not applicable
                    if (rsz===1) {
                        expStr = "((0 => "+expStr+", others => '0'))";
                    } else {
                        expStr = "resize("+expStr+","+lsz+")";
                    }
                }
                if (type(obj.target).unsigned && !type(obj.expr).unsigned) {
                    str += "unsigned("+expStr+")";
                } else if (!type(obj.target).unsigned && type(obj.expr).unsigned) {
                    str += "signed("+expStr+")";
                } else {
                    str += expStr;
                }
            }
//console.log("Slice ()"+str);
            if (str.slice(0,1)==="(" && str.slice(-1)===")") {str = str.slice(1, -1);}
        }
        return str;
    }
    
	// output VHD code for combinational or sequential logic
	function emitVHD(indent, isComb) {
		let str = "";
		let spaces = " ".repeat(indent)+" ".repeat(3*Number(obj.level));

		if (setup.verilog) {
          if ((obj.id==="=" && isComb) || (obj.id==="<=" && !isComb)) {
			const asop = (obj.id==="<=") ? " <= " : " = ";
			str = spaces + obj.target.emitVHD()+asop+emitExpr(isComb)+";\n";
          }
			return str;
		}

		if ((obj.id==="=" && isComb) || (obj.id==="<=" && !isComb)) {	// assignment
			str = spaces + obj.target.emitVHD()+" <= "+emitExpr(isComb)+";\n";
		}
		return str;
	}

	if (log) {console.log("Statement: "+obj.id);}
	return {get, set, setTarget, setExpr, val, visit, emitVHD, emitExpr};
}

// if-else statement: expr = condition, block = if block, elseblock = else block
function IfStatement() {  "use strict";
	let obj = {id: "if", expr: null, ifBlock: null, elseBlock: null, translated: false, level:0, pos:{x:0, y:0}, ifType: 0, elsif: 0};

	function get() {
		return obj;
	}

	function set(o) {
		let opStr="";
		if (o.hasOwnProperty("translated")) {obj.translated = o.translated; opStr+="translated:"+o.translated;}
		if (o.hasOwnProperty("level")) {obj.level = o.level; opStr+="level:"+o.level;}
		if (o.hasOwnProperty("pos")) {obj.pos = o.pos;}
		if (o.hasOwnProperty("combProc")) {obj.combProc = o.combProc; opStr+=" cp:"+o.combProc;}
		if (o.hasOwnProperty("seqProc")) {obj.seqProc = o.seqProc; opStr+=" sp:"+o.seqProc;}
		if (o.hasOwnProperty("elsif")) {obj.elsif = o.elsif; opStr+=" elsif:"+o.elsif;}
		if (o.hasOwnProperty("elsLink")) {obj.elsLink = o.elsLink; opStr+=" elsLink";}
        if (o.hasOwnProperty("ifType")) {obj.ifType = o.ifType; opStr+=" type:"+o.ifType;}
		if (logset) {console.log("Statement.set "+obj.id+opStr);}
	}

	function setExpr(e) {
		obj.expr = e;
	}

	function setIf(b1, b2) {
		obj.ifBlock = b1;
		obj.elseBlock = b2;
	}

	function val(firstCycle, numCycle) {
		let change = false;
        let b = obj.expr.val();

        if (!vec.isZero(b)) {
            if (logval) {console.log("St.val if "+obj.expr.visit(-1)+": true");}
            obj.ifBlock.statements.forEach(function(st) {
                if (st.val(firstCycle, numCycle)) {change = true;}
            });
        } else if (obj.elseBlock!==null) { // else exists
            if (logval) {console.log("St.val if "+obj.expr.visit(-1)+": false");}
            obj.elseBlock.statements.forEach(function(st) {
                if (st.val(firstCycle, numCycle)) {change = true;}
            });
        }
        return change;
	}

	function visit(pass, parObj) {  // If Statement.visit
        const vars=(parObj===undefined) ? undefined : parObj.vars;
        const block=(parObj===undefined) ? undefined : parObj.block;
        
		let str = (" ".repeat(Number(block.level)))+"if "; //obj.id+": "; V31 output spaces
		let st0 = undefined;
		
		if (log) {console.log("Statement.visit: "+pass+" bck="+block.name);}

        if (pass===1) {
            //str += "<"+obj.elsif+">";
            stat.initNames();
console.log("# Visit condition: "+obj.ifBlock.get().name);
            str += obj.expr.visit(pass, {stat: false, block: block, ifName:obj.ifBlock.get().name})+"\n";  // visit condition, save variable names

			stat.getNames().forEach(function (id) {
                setHdlMode(vars.get(id), "in");
            });

            if (obj.expr.getOp()==="==") { // test var == num or var == const V33
                let opLvar = obj.expr.getLeft().get().isVar; // left is Var
                const opRtype = type(obj.expr.getRight()).id;  // "num", "sig"
                const opRconst = (obj.expr.getRight().get().op=="" && mode(obj.expr.getRight().getLeft()));
                 
                if (opLvar) { // check if not one bit variable
                    if (obj.expr.getLeft().get().type.size===1) opLvar=false;
                }
                if (opLvar && (opRtype==="num" || (opRtype==="sig" && opRconst))) 
                { 
                    obj.conEqualId=obj.expr.getLeft().get().name;
                }
            }

            str += obj.ifBlock.visit(pass, {vars:vars, block:block}); // visit if block

            if (obj.elseBlock!==null) {				
                st0 = obj.elseBlock.statements[0];
                if (st0!==undefined && st0.get().id==="if") {  // else if
                    if (st0.get().elsif===1) {
                        let mainLink = obj.elsLink;
                        if (mainLink===undefined) {st0.set({elsLink: obj});}
                        else {st0.set({elsLink: mainLink});}

                        obj.els = true;
                    }
                }
                str += (" ".repeat(Number(block.level)))+"else\n" + obj.elseBlock.visit(pass, {vars:vars, block:block});  // visit else block
            }
        } else if (pass===2) {
            str += obj.ifBlock.visit(pass, {vars:vars, block:block});
            if (obj.elseBlock!==null) {
                st0 = obj.elseBlock.statements[0];
                if (st0!==undefined) {
                    const objEls=st0.get().elsLink; // TODO: warning local obj changes defaut obj, remove const!

                    if (objEls!==undefined && st0.get().id==="if") {
//console.log("PASS2: IF: "+st0.get().expr.visit(1)+" > "+st0.get().conEqualId+" < "+st0.get().elsLink.conEqualId);
                        if (st0.get().elsLink.conEqualId!==undefined && st0.get().elsLink.conEqualId!=="") {
                            if (st0.get().conEqualId === st0.get().elsLink.conEqualId) {
                                if (objEls.isCase!==false) {objEls.isCase = true;} // if undefined | true
                            } else {
                                objEls.isCase = false;
                            }
                        }
                        if (st0.get().elseBlock) { // statement has else block
                            objEls.isOthers = true;
                        } else {
                            objEls.isOthers = false;
                        }
                    }
                }
                str += "else " + obj.elseBlock.visit(pass, {vars:vars, block:block});
            }
            if (obj.isCase) {setLog("Opt: if transformed to case!");}  // Optimization if to case
        }
    return str;
	}

	// output VHD code for combinational or sequential logic
	function emitVHD(indent, isComb) {
		let str = "";
		let spaces = " ".repeat(indent)+" ".repeat(3*Number(obj.level));
		
        stat.initNames();
        let condStr = obj.expr.emitVHD(); // get condition and strip spaces
        if (condStr.slice(0,1)==="(" && condStr.slice(-1)===")") {condStr = condStr.slice(1, -1);}
        stat.getNames().forEach(function (id) { // add comb if expr. vars to sensitivity list
            let v1 = model.getVar(id, true);
            if (v1!==undefined && hdl(v1).mode!=="const" && obj.combProc && isComb) {
              process.addVar(id);
            }
        });

        let doCase = obj.isCase || (obj.elsLink!==undefined && obj.elsLink.isCase);		
		
console.log("Model: isCase:"+obj.isCase+" "+(obj.elsLink!==undefined && obj.elsLink.isCase));
console.log("IFCS +cp="+obj.combProc+" +sp="+obj.seqProc);
        if (obj.ifType===1) { //V31
            //obj.ifBlock.statements[0] is assignment!!
            let as = obj.ifBlock.statements[0];
            let as2 = obj.elseBlock.statements[0];
        
            if (setup.verilog) { 
                str = as.get().target.emitVHD()+" = ("+condStr+")? "+as.emitExpr(isComb);
                str += " : " + as2.emitExpr(isComb) + ";\n"; 
            } else {
                str = " "+as.get().target.emitVHD()+" <= "+as.emitExpr(isComb);
                str += " when "+condStr+" else "+as2.emitExpr(isComb)+";\n";
            }
        } else if ((obj.combProc && isComb) || (obj.seqProc && !isComb)) {
            str = "";
            
            
			const bitSize = type(obj.expr.getLeft()).size;
			let bv = ""; // V33 bit string or signal name

            if (obj.expr.getOp()!=="") { // V38
                if (type(obj.expr.getRight()).id === "num") { bv = bitString(obj.expr.getRight().emitVHD(), bitSize);}
            else {bv = obj.expr.getRight().emitVHD(); }
            } 
            if (obj.elsif!==1) { // start new conditional statement
                if (obj.els && obj.isCase) {
                    if (setup.verilog) {
                        str += spaces + "case ("+obj.expr.getLeft().emitVHD()+")\n";
                        str += spaces + " "+bv+":\n";                        
                    } else {                    
                        str += spaces + "case "+obj.expr.getLeft().emitVHD()+" is\n";
                        str += spaces + " when "+bv+" =>\n";
                    }
                } else {
                    if (setup.verilog) {str += spaces + "if ("+condStr+") begin\n";}
                    else {str += spaces + "if "+condStr+" then\n";}
                }
            } else {            // continue conditional (elsif or when)
                if (doCase) {
                    //const bitSize = type(obj.expr.getLeft()).size;
                    //let bv = bitString(obj.expr.getRight().emitVHD(), bitSize);
                    if (setup.verilog) {str += " "+bv+":\n";}
                    else {str += " when "+bv+" =>\n";}
                } else {
                    if (setup.verilog) { str += "if ("+condStr+") begin\n"; }
                    else { str += "if "+condStr+" then\n"; }
                }
            }

            // emit statements inside IF BLOCK
            let ifBodyStr="";
            obj.ifBlock.statements.forEach(function (st) {
                ifBodyStr += st.emitVHD(indent, isComb);
            });

            if (ifBodyStr==="") {str += spaces+"   null;\n";} // null statement
            else { str += ifBodyStr; }

            // TODO: check if else block exists and is required to emit

            if (obj.elseBlock!==null) { // transform else block
                let elseKey="";
                let elseStr="";

                if (obj.els) {
                    if (doCase) { elseKey += spaces; } // ...+when
                    else { elseKey += spaces+"els"; }  // ...+els+if
                } else {
                    if (doCase && obj.elsif===1 && !obj.els) { 
                        if (setup.verilog) {elseKey+=spaces+" default:\n";}
                        else {elseKey+=spaces+" when others =>\n"; }
                    }
                    else {
						if (setup.verilog) {elseKey += spaces+"end else begin\n";}
                        else {elseKey += spaces+"else\n";}
					}
                }

                obj.elseBlock.statements.forEach(function(st) {
                    elseStr += st.emitVHD(indent,  isComb);
                });

                // emit else only if not empty!
                if (elseStr!=="") {str += elseKey + elseStr;}

                //if (elseStr==="") {str += spaces+"   null;\n";} // null statement
            }

            if (obj.elsif!==1) { // end if (case)
                if (doCase) {
                    if (setup.verilog) {
                        if (obj.isOthers===false) { str += spaces+" default: ;\n";}
                        str += spaces + "endcase\n";
                    } else {
                        if (obj.isOthers===false) { str += spaces+" when others => null;\n";}
                        str += spaces + "end case;\n";
                    }
                } else { 
                  if (setup.verilog) {str += spaces + "end\n"; }
                else {str += spaces + "end if;\n"; }
                }
            }
        }
		return str;
	}


	if (log) {console.log("Statement: "+obj.id);}
	return {get, set, setExpr, setIf, val, visit, emitVHD};
}

function Instance(name, labstr) {  "use strict";
	let obj = {id: "inst", label: labstr, entity: name, portList: [], varList: [], targets: [], source: null, translated: false};

	function get() {
		return obj;
	}

	function set(o) {
		let logStr="";
		if (o.hasOwnProperty("pos")) {obj.pos = o.pos;}
		if (o.hasOwnProperty("varList")) {obj.varList = o.varList; logStr+="varList";}
		if (o.hasOwnProperty("source")) {obj.source = o.source; logStr+="source";}
		if (o.hasOwnProperty("translated")) {obj.translated = o.translated; logStr+="translated:"+o.translated;}
		if (logset) {console.log("Instance.set "+obj.id+logStr);}
	}

	function visit(pass) // V36 TODO
	{
		let str=obj.entity+"(";
		if (pass===1) {
			if (obj.source !== null) {
				let i = 0;
				obj.source.ports.forEach(function (p, id) {
					if (!obj.portList.includes(id) && (p.mode==="in" || p.mode==="out")) {obj.portList.push(id);}
					if (p.mode==="out") {
						setHdlMode(obj.varList[i], "out");
						let varName = obj.varList[i].get().name;
						obj.targets.push(varName);
					} else if (p.mode==="in") {
						setHdlMode(obj.varList[i], "in");
					}
					i += 1;

				});
				}
			if (obj.varList.length !== obj.portList.length) {
				throw modelErr("Parameter number mismatch", "", stat.getPos());
			}
			
			obj.varList.forEach(function (id, j) {
				str += id.emitVHD();
				if (j < obj.varList.length-1) {str += ",";}
			});
			
		}
		str += ")";
		return str;
	}

	function val(firstCycle, numCycle)
	{
		let change = false;
		// set input variable values
		obj.varList.forEach(function (id, j) {
			if (obj.source.getVar(obj.portList[j], true).get().mode==="in") {
				let inval = id.val();
				obj.source.getVar(obj.portList[j], true).setNext(inval);
				obj.source.getVar(obj.portList[j], true).next();
			}
		});

		// evaluate statements (like valDelta, if...)
		obj.source.getBlok().statements.forEach(function(st) {
		if (st.val(firstCycle, numCycle)) {
			change = true;
			}
		});

		let changeNext = false;
		if (change) {
			obj.source.vars.forEach(function(v) {
			if (v.next()) {changeNext = true;}
			});
		}

		// set output values
		obj.varList.forEach(function (id, j) {
			if (obj.source.getVar(obj.portList[j], true).get().mode==="out") {
				let value = obj.source.getVar(obj.portList[j], true).val();
//console.log("********************************** val "+id.get().name+" = "+val);
				id.setNext(value);
			}

		});

		return changeNext;
	}

	function emitVHD()
	{
		let str = obj.label + ": entity work."+obj.entity+" port map (\n";

		if (obj.source.getSeq()) {str += "  clk => clk,\n";}

		obj.varList.forEach(function (id, j) {
			str += "  "+obj.portList[j]+" => "+id.emitVHD();
			if (j < obj.varList.length-1) {str += ",\n";}
		});

		str += " );\n";

		return str;
	}

	return {get, set, visit, val, emitVHD};
}

function Blok(namestring) {
 let obj = {name:namestring, combCnt:0, seqCnt:0, level:0};
 let statements = [];
 let targets = [];

 function get() {
	 return obj;
 }

 function set(o) {
	let logStr="";
	if (o.hasOwnProperty("combCnt")) {obj.combCnt = o.combCnt; logStr+="ccnt: "+o.combCnt;}
	if (o.hasOwnProperty("seqCnt")) {obj.seqCnt = o.seqCnt; logStr+="scnt: "+o.seqCnt;}
	if (o.hasOwnProperty("level")) {obj.level = o.level; logStr+="level:"+o.level;}
	if (o.hasOwnProperty("oneline")) {obj.oneline = o.oneline; logStr+="oneline:"+o.oneline;}
console.log("Blok.set "+logStr);
 }

 function push(st) {
	 statements.push(st);
 }
 
 function unshift(st) {
	 statements.unshift(st);
 }

 function visit(pass, parObj) {
    const vars=(parObj===undefined) ? undefined : parObj.vars;
    //const block=(parObj===undefined) ? undefined : parObj.block;
     
console.log("Block.visit "+pass+" "+obj.name);
    //let str = "Blok("+obj.level+" c:"+obj.combCnt+" s:"+obj.seqCnt+"): \n";
    let str = ""; 
	//let str = "B"+obj.name+": \n"; //V31
	statements.forEach(function (st) {
		stat.setPos(st.get().pos); // save current visit statement position
		if (pass===1) {
			if (st.get().id==="=") {obj.combCnt += 1;}
			if (st.get().id==="<=") {obj.seqCnt += 1;}
		}
        
		str += st.visit(pass, {vars: vars, block: obj})+"\n";  // V36 parObj
		if (pass===1) {
			if (st.get().id==="=" || st.get().id==="<=") {
				let id = st.get().target.get().name;
				if (targets.includes(id)) {
				//Multiple assignments to "+id+" in the same block!
				//	throw modelErr("mult", id, st.get().pos); // Multiple assignments to "+id+" in the same block!", st.get().pos);
				} 
				targets.push(id);
			} else if (st.get().id==="inst") {
				st.get().targets.forEach(function (id) {
					if (targets.includes(id)) {
						throw modelErr("mult", id, st.get().pos);
					} 					  
					targets.push(id);
				});
			}
		}
	});
	if (log) {console.log("Block: comb="+obj.combCnt+" seq="+obj.seqCnt);}
//	str += "Blok end:"+" c:"+obj.combCnt+" s:"+obj.seqCnt+"): \n";
	return str;
 }

 return {get, set, statements, targets, push, unshift, visit};
}

