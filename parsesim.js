/*File: parsesim.js, language parser and simulator, V3.7 */
/*jshint esversion: 6 */
/*jslint bitwise: true */

const parseVersion = "V.37";
const MAXITER = 20;
const MAXCYC = 1000;
const logParse = false;
const resEnabled = false;  // enable resource estimation

let globCurStatement="";
let globPrevStatement="";
let globAssignSize=0; //29.3.

let vec=new Vector();
let model = undefined;

// V33 Debug log functions
function logPorts(m) {
 let s = "Ports:";
 m.ports.forEach(function(val, id) {s+=" "+id;});
 setLog(s);
}

function logVars(m) {
 m.vars.forEach(function(v) { 
    let s = "";
    let obj = v.get();
    s += obj.name+" "+obj.mode;
    let u = " u";
    if (!obj.type.unsigned) {u = " s";}
    s += " {"+obj.type.id+u+obj.type.size;
    if (obj.type.qual!=="") s += " qual:"+obj.type.qual;

    s += " hdl{";
    if (obj.hdl.hasOwnProperty("mode")) s += obj.hdl.mode+" ";
    if (obj.hdl.hasOwnProperty("val")) s += obj.hdl.val+" ";
    s += "} ";
    
    s += "val="+v.val()[0];
    setLog("Var: "+s); 
 });
}

function Circuit(nameString, toplevel) {
 let nameStr = nameString;
 let b = new Blok("1");
 let entity = false;
 let vars = new Map();
 let assignVars = []; // V3.6 assigned vars in main block
 
 let ports = new Map(); // get ports for top-level circuit V31
 let qType = new Map(); // qualified type map V33
 
 let labels = [];
 let sequential = false;
 let srcChanged = false;     // input source changed after parsing
 
 function name() {
	 return nameStr;
 }
 
 function runErr(str) {
	const er = (english) ? "Runtime Error: " : "Napaka izvajanja: ";
	return "<span style='color: red;'>"+er+"</span>"+errTxt(str);
 } 

 function idErr(str, id) {
	const er = (english) ? "Error: " : "Napaka: ";
	return "<span style='color: red;'>"+er+"</span>"+errTxt(str, id);
 } 
 
 function setPorts(id, obj) {
	 ports.set(id, obj);
 }
 
 function getVar(id, returnNull) {  // get or create new, if not returnNull
     //console.log("Cir.getVar "+id);
	 const sId = id.toLowerCase();
	 
	 if (!vars.has(id)) {
		if (returnNull) {return null;}  // if not found, return null
		if (VHDLrsv.indexOf(sId)>=0) { throw idErr("rsv",id); } // is VHDL keyword?
	
        // check if exists the same name with different case	 
	    let ids = Array.from( vars.keys() ).map(v => v.toLowerCase());	
		// exists if compare small letters, mixed case error
		if (ids.indexOf(sId)>=0) { throw idErr("mixc",id); } 
		
		let v = new Var(id);		
		if (ports.has(id)) { // try to get type & mode from ports
			if (ports.get(id).init!==undefined) {			
				v.set({init: ports.get(id).init});
			}
            if (ports.get(id).type.size===0) {   // ports type u0
                v.set({type: getDefaultType()}); // get from global
            } else {
                v.set({type: ports.get(id).type});
                v.set({mode: ports.get(id).mode});
            }
		} else {             // ...or from global setup
			v.set({type: getDefaultType()});
		}
		vars.set(id, v);
	 }
	 return vars.get(id);
 }
 
 function get() {
     return b.get();
 }

 function getBlok() {
	 return b;
 }
 
 function setBlok(blok) {  // set block of statements
    b = blok;   
 }
 
 function valDelta(firstCycle, i) { // evaluate delta cycle
	let change = false;
console.log("*-- Delta cycle:"+firstCycle);	
	if (log) {
		console.log("--- Delta cycle:"+firstCycle);
		vars.forEach(function(v) { 
		  console.log(v.visit(-1,{})+"="+vec.hex(v.val())); 
		});
        console.log("--- ---- ---");
	}
	
	b.statements.forEach(function(st) {
		if (st.val(firstCycle, i)) {
			change = true;
			}
	});
	
	let changeNext = false;
	if (change) {		
		vars.forEach(function(v) {
		if (v.next()) {changeNext = true;}
		});
	}
	
	return changeNext;
 }
 
 function val(i) {	 // evaluate (simulate) one cycle
	let iter = 1;
	let change = true;
	
/*	let s = getInValues(i-1);  // read input(i-1) // V34 odstranil, preveri!!
	if (s===undefined) {return;}
	
	s.forEach(function (val, id) {
		//y= vec.parse(val);		
		let v = getVar(id);
		v.setVal(vec.parse(val));
	});	 */
	
	change = valDelta(true, i);
	
	s = getInValues(i);  // read input (i)
	if (s===undefined) {return;}
	
	s.forEach(function (val, id) {		
		v = getVar(id);
		v.setVal(vec.parse(val));
	});	
	
	change = valDelta(false, i); // second delta, combinational
	
	 while (change && iter<MAXITER) {
		change = valDelta(false, i);
		iter += 1;
	 }
	 
	 if (iter>=MAXITER) {
		 throw runErr("inf");
	 }
	 
	return true;
 }
 
 function visit(pass) { // visit block, set pass number and give access to vars
	return b.visit(pass, {vars: vars, block: b.get()});
 }
 
 function push(st) {
	b.push(st);
 }
 
  function unshift(st) {
	b.unshift(st);
 }

 function setSeq(b) {
	 sequential = b;
 }
 
 function getSeq() {
	 return sequential;
 }
 
 function changed(b) {
	 if (b!==undefined) {srcChanged = b;}
	 return srcChanged;
 }
 
 return {name, entity, vars, ports, qType, labels, setPorts, getVar, get, getBlok, setBlok, push, unshift, visit, val, setSeq, getSeq, changed, assignVars}; 
}


function Parse(k) {
    let circ = undefined;  // current circuit for parsing
    
    let rtlStat = []; // V3.6 RTL sequential statements
	let defStat = []; // default statements for RTL
    
	function peek() {return k.current();}     // look current token
	function consume() {return k.consume();}  // consume & return token	
	function peekNext() {return k.peek();}    // look next token
	
	function skipSeparators() {
		while (k.current().isSeparator()) {consume();}
	}
	
	function parseErr(str, id) {
		const er = (english) ? "Parse Error " : "Napaka ";
		const er1 = (english) ? "at " : "v ";
		const line = Number(peek().pos().substr(0, peek().pos().indexOf(':')));
		
		selectLine(line);
		
		return "<span style='color: red;'>"+er+"</span>"+er1+peek().pos()+": "+errTxt(str, id);
	}
	// check if peek() contains op and if it has correct syntax setup
	function testOp() {
		if (peek().isVHD() && setup.syntaxC) {throw parseErr("vuse");}
		if (!peek().isVHD() && !setup.syntaxC) {throw parseErr("cuse");}
	}	
	
	function primary(n) { // primary :== name | literal | ( expression )
		let t=peek();
		
		if (t.isID()) { // identifier, save variable & set op type
			let v = circ.getVar(consume().id); 
			if (peek().id === "(") { // variable slice
				consume();
				t=peek();
				if (t.isID()) { // slice with index variable 
					let index = circ.getVar(consume().id);              
                    setHdlMode(index, "in"); //V 33a set HDL mode of index
					t=peek();
					if (t.id===")") { consume(); }
					else {throw parseErr("exp",")");}
					v = new Slice(v);
					v.sliceSetup(-1, index);					
				} else if (t.isNum()) {
					let num = Number(consume().id);
					let num2 = num;
					t=peek();
					if (t.id===":") { 
						consume(); t=peek();
						if (!t.isNum()) {throw parseErr("explit");}
						num2 = Number(consume().id);
						t=peek();
					}
					
					if (t.id===")") { consume(); }
					else {throw parseErr("exp",")");} // Expected ) 
					if (!(num>=num2)) {throw parseErr("slice",")");}
					if (type(v).qual==="array") {
						if (num>=type(v).asize){throw parseErr("slice",")");}
					} else {
						if (num>=type(v).size) {throw parseErr("slice",")");}
					}
					
					v= new Slice(v); // change
					v.sliceSetup(num, num2);
				} else {
					throw parseErr("explit");
				}
			}
			
			n.left(v);
			n.set({type: type(v)});
			return n;
		}
		else if (t.isNum()) { // number
			let token = consume();			
			let num = new NumConst(token.id, token.format()); 
			n.left(num); 			
			n.set({type: type(num)});
			return n;
		}
		else if (t.id === "(") { // braces with new expression
			consume();
			let e = expression(n); 
			if (peek().id===")") { consume(); }
			else { 
			  throw parseErr("exp",")"); // Expected ) 
			}
			return e;					
		} else {
			if (t.isString()) throw parseErr("str");
			throw parseErr("expvn"); //Expected identifier or number
		}
	}
	
	function factor(x) { // factor :== primary | - primary | NOT primary	
		let t=peek();		
		
		if (t.id==="-" || t.id==="~") { // unary operator
            let isNot = false;
			if (t.id==="~") {
                isNot = true;
                testOp();
            }
			let o = consume().id;
			// set empty or create new Op
			if (x.getOp()==="") {x.op(o);} 
			else {x = new Op({op:o, left:x, right:null});}			
			
			let x2 = primary(new Op({op:"", left:null, right:null}));
			x.right(x2);
			let u2 = type(x2).unsigned;
			let sz = type(x2).size;
            
			x.set({type: {unsigned: u2, size: sz}});
            if (isNot && type(x2).bool===true) {
                x.set({type: {bool: true}});
            }
		} else {
			x = primary(x);
		}
			
		return x;
	}
	
	function term(n) {  // term :== factor {* factor}
		let f = factor(n);
		if (f === undefined) {return;}
						
		while (peek().id==="*") {
			let o = consume().id;
			
			if (f.getOp()==="") { // set empty or create new
				f.op(o);				
			} else {
				f = new Op({op:o, left:f, right:null});
			}			
				
			// second factor
			let f2 = factor(new Op({op:"", left:null, right:null})); 
			f.right(f2);
			
			const sz1 = type(f).size;
			const sz2 = type(f2).size;
			let sz = sz1 + sz2;  // product size

			if (sz1===1 && sz2===1) { // for 1 bit change to AND
				f.op("&");
				sz = 1; 
			} else if (sz1===1 || sz2===1) { // one operand is bit
			    sz = sz1 + sz2 - 1;
			}
			
			let u1 = type(f).unsigned;
			let u2 = type(f2).unsigned;
			
			if (!u1 && u2) { // signed & unsigned number > signed
				if (type(f2).id==="num") {
					f2.set({type: {unsigned: false}});
					u2 = false;
				}
			} else if (u1 && !u2) { // unsigned num & signed > signed num
				if (type(f).id==="num") {
					f.set({type: {unsigned: false}});
					u1 = false;
				}				
			}
			
			if ((u1 && !u2) || (!u1 && u2)) {
				throw parseErr("mixs");
			}			
			
			f.set({type: {unsigned: (u1 && u2), size: sz}});			
		}
		
		return f;
	}

	function simpleExp(n) {  // simpleExp :== term {+,-,',' term}	
		let x = term(n);
		if (x === undefined) {return;}
						
		// special case for concat
		while (peek().id==="+" || peek().id==="-" || (peek().id==="," && !setup.syntaxC)) {
			let o;
		
			o = consume().id;			
			
			// set empty or create new Op
			if (x.getOp()==="") {x.op(o);} 
			else {x = new Op({op:o, left:x, right:null});}			
				
			// second relation
			let x2 = term(new Op({op:"", left:null, right:null})); 
			x.right(x2);
			
			const sz1 = type(x.getLeft()).size;  // compare left & right 
			const sz2 = type(x.getRight()).size;
			let sz = Math.max(sz1, sz2);
            
			if (globAssignSize >= sz+1) {sz += 1;} // allow carry if assigment size fits
			
			if (o===",") {sz = sz1+sz2;}
            else if (sz1===1 && sz2===1 ) { // V33 one bit+- not supported!
               {throw parseErr("ads1");}
            }
            
			let u1 = type(x.getLeft()).unsigned;
			let u2 = type(x.getRight()).unsigned;
			
			if (!u1 && u2) { // signed & unsigned number > signed
				if (type(x.getRight()).id==="num") {
					x.set({type: {unsigned: false}});
					u2 = false;
				}
			} else if (u1 && !u2) { // unsigned num & signed > signed num
				if (type(x.getLeft()).id==="num") {
					x.set({type: {unsigned: false}});
					u1 = false;
				}				
			}
			if ((u1 && !u2) || (!u1 && u2)) {throw parseErr("mixs");}			
			
			x.set({type: {unsigned: u1 && u2, size: sz}});
		}
		
		return x;
	}	
	
	function shift(n) {  // shift :== simpleExp {<<, >> literal}
		let x = simpleExp(n);
		if (x === undefined) {return;}
						
		if (peek().id==="<<" || peek().id===">>") {  // currently only <<
			testOp();
			let o = consume().id;
				
			// second operand (fixed number)
			let t=peek();
			
			if (t.isNum() || t.isID()) { // V3.4b right operand number or identifier
				let token = consume();
                let shiftConst = true;   // shift constant amount 
                let num = 1;
                let v = undefined;
                
                if (t.isID()) { // identifier, save variable                
                    v = circ.getVar(token.id);
                    shiftConst = false; 
                } else {
                    num = Number(token.id); //new NumConst(token.id, token.format());                      
                }
				let numc = new NumConst(token.id, token.format());
                
				const sz = type(x).size;
				
                if (x.getOp()==="") { // V 3.4b check for valid shift expression
					if (!x.getLeft().get().isVar) {throw parseErr("unsh");}
                } else {throw parseErr("unsh");}
                
				if (o==="<<") {
					x.op("<<");					
                    
                    if (shiftConst) { 
                        if (num<1 || num+sz>64) {throw parseErr("sizeov");}
                        x.right(numc); 
                    } else {
                        x.right(v); 
                    }
					
					let u1 = type(x).unsigned;			
					x.set({type: {unsigned: u1, size: (sz)}}); // V3.5 do not resize !! (sz+num)
				} else { // >>
					x.op(">>");					
                    
                    if (shiftConst) { 
                        if (num<1 || num+sz>64) {throw parseErr("sizeov");} //todo
                        x.right(numc); 
                    } else {
                        x.right(v); 
                    }
					
					let u1 = type(x).unsigned;			
					x.set({type: {unsigned: u1, size: (sz)}});

				/*
					if (x.getOp()==="") {
						let v = x.getLeft();						
						if (v.get().isVar) {
							const n = type(v).size-1;
							if (n-num<0) {throw parseErr("sizeov");} //Size underflow
														
							let slice = new Slice(v,n,num);
							x.left(slice);							
							x.set({type: slice.get().type});  // reset the Op size
						}	
					} else {throw parseErr("unsh");}
*/
				}
				
			} else {
				throw parseErr("explit"); //Expected numeric literal
			}
		}
		
		return x;
	}
	
	function relation(n, boolRel) {  // relation = shift {=, /=, <...} shift 
		let e = shift(n);	
		if (e === undefined) {return;}
		let br = (boolRel) ? "T ":"F ";

		let opEqual = false;
		if (peek().id==="=") {
			if (setup.syntaxC) {throw parseErr("vuse");}
			opEqual=true;  // VHDL comparison op (=)
		} 		
		if (isComparisonOp(peek().id) || opEqual) {
			if (globCurStatement==="a") {throw parseErr("rel");} // V31 relation not allowed in assignment
			let o;
			if (opEqual) {o="=="; consume();}
			else {
				if (peek().id==="!=" || peek().id==="==") {testOp();}
				o=consume().id;				
			}
			
			if (e.getOp()==="") { // empty operation
				e.op(o);
			} else {
				const opType={...type(e)};
				e = new Op({op:o, left:e, right:null}, opType);
			}	

			e.set({type: {bool: true}});
							
			let e2= shift(new Op({op:"", left:null, right:null}));

			e.right(e2);
			
		    // check if compare sig of same type or sig & num			
			let sz = Math.max(type(e).size, type(e2).size);			
			e.set({type: {unsigned: true, size: 1}});
			
		} else if (boolRel && type(e).bool!==true) { // add required operator (value != 0)			
			let o = "!=";
			let rightObj = new NumConst(0); 
			
			if (type(e).size===1) { // ==1, if expression is one bit
				o = "==";
				rightObj = new NumConst(1);
			} else { // set size of num const!
				rightObj.set({type: {size: type(e).size}});
			}
			if (e.getOp()==="") { // empty op
				e.op(o);
			} else {
				e = new Op({op:o, left:e, right:null}, {...type(e)}); // V34c, copy type properties
			}										
			e.right(rightObj);
		}
		
		//let logstr = e.visit(true);   // visit operator for statistics
		return e;
	}	
	
	function bool (n, boolRel) {  // bool :== relation { AND relation }
		let x = relation(n, boolRel);
		if (x === undefined) {return;}
						
		while ((peek().id==="&" && !setup.syntaxC) || (peek().id==="," && setup.syntaxC)) {
			let o;
			if (peek().id===",") { // consume & and set operator to ","
				consume().id;
				o = "&";
			} else {
				o = consume().id;				
			}
			
			const bool1 = type(x).bool ? true:false;

			// set empty or create new Op
			if (x.getOp()==="") {x.op(o);} 
			else {x = new Op({op:o, left:x, right:null});}			
				
			// second relation
			let x2 = relation(new Op({op:"", left:null, right:null}), boolRel); 
			x.right(x2);
			const bool2 = type(x2).bool ? true:false;

			if (bool1 && bool2) x.set({type: {bool: true}});
			
			const sz1 = type(x).size;
			const sz2 = type(x2).size;
			let sz = Math.max(sz1, sz2);			
			let u1 = type(x).unsigned;
			let u2 = type(x2).unsigned;
			
			if (!u1 && u2) { // signed & unsigned number > signed
				if (type(x2).id==="num") {
					x2.set({type: {unsigned: false}});
					u2 = false;
				}
			} else if (u1 && !u2) { // unsigned num & signed > signed num
				if (type(x).id==="num") {
					x.set({type: {unsigned: false}});
					u1 = false;
				}				
			}
			
			if ((u1 && !u2) || (!u1 && u2)) {throw parseErr("mixs");}			
			
			x.set({type: {unsigned: u1 && u2, size: sz}});
		}
		
		return x;
	}
	
	function expression(n, boolRel) {  // expression :== bool { OR,XOR,XNOR bool}	
		let x = bool(n, boolRel);
		let o = "?";
		if (x === undefined) {return;}
		
		while (peek().id==="|" || peek().id==="^" || peek().id==="~^") { 
			testOp();
			o = consume().id;
		
			if (x.getOp()==="") { // set empty or create new operation
				x.op(o);
			} else {
				const opType={...type(x)};   //copy type property
				x = new Op({op:o, left:x, right:null}, opType); // type(x)
			}
			
			const bool1 = type(x).bool ? true:false;
			
			// second relationA
			let x2 = bool(new Op({op:"", left:null, right:null}), boolRel);
			x.right(x2);
			
			const bool2 = type(x2).bool ? true:false;
			if (bool1 && bool2) x.set({type: {bool: true}});
						
			let sz = Math.max(type(x).size, type(x2).size);			
			
			let u1 = type(x).unsigned;
			let u2 = type(x2).unsigned;
			if (!u1 && u2) { // signed & unsigned number > signed
				if (type(x2).id==="num") {
					x2.set({type: {unsigned: false}});
					u2 = false;
				}
			} else if (u1 && !u2) { // unsigned num & signed > signed num
				if (type(x).id==="num") {
					x.set({type: {unsigned: false}});
					u1 = false;
				}				
			}
			
			if ((u1 && !u2) || (!u1 && u2)) {
				throw parseErr("mixs");
			}
			x.set({type: {unsigned: u1 && u2, size: sz}});
		}
		
		let logstr = x.visit(0, {stat: true});   // visit operator for statistics
		if (log) {console.log(logstr);}		
		return x;
	}
	
    // assignment expression or conditional assignment to variable v
	function parseAssign(b, v, op, pos)
	{
		globCurStatement="a";
        const op0 = setup.rtl ? "=" : op; // V3.6, force operator to = 
                
		a = new Statement(op0);  // op, statement, define target, position and level
		a.set({pos: pos});
		let level =	circ.getBlok().get().level;
		a.set({level: Number(level)});
		stat.setPos(pos);
		globAssignSize = type(v).size;
        
        if (setup.rtl && op==="<=") { // V3.6, add _next signal and assignment		
            const dName=v.get().name;        
            const vnext = circ.getVar("_next_"+dName); 
            
            vnext.set({type: type(v)});            
            a.setTarget(vnext);
            
            let a1 = new Statement("<=");
            let op1 = new Op({op:"", left:vnext, right:null});
            a1.setTarget(v);
            a1.setExpr(op1);
            a1.set({pos: pos});
            let notexist = true;
            for (i in rtlStat)
                if (rtlStat[i].name === dName) notexist=false;
            
            if (notexist) rtlStat.push({st: a1, name: dName});
            
			if (b.get().name!=="1") { // add default statement, if not in main block			
				let a2 = new Statement("=");  
				let op2 = new Op({op:"", left:v, right:null});
				a2.setTarget(vnext);
				a2.setExpr(op2);
				a2.set({pos: pos});
				notexist = true;
				for (i in defStat) {
					if (defStat[i].name === "_next_"+dName) notexist=false;
				}
				if (notexist) defStat.push({st: a2, name: "_next_"+dName}); 
            }

        } else {
            a.setTarget(v);
        }
		
		// opnode
		let node = new Op({op:"", left:null, right:null});
		node = expression(node); //exprList(node); 		
		
		if (node === undefined) {return;}
//node.set({name: v.get().name});
        a.setExpr(node);
		
		if (node.count()===1 && type(node).id==="num") {  // single value assigment
			if (type(node).format[0]==="b") {             // binary format		
				let t = {...type(v)};  // type: unsigned, size of binary
				t.unsigned = true;
				t.size = Number(type(node).format.slice(1));
				t.def = false;
				if (type(v).def) {    // redefine default data type (not from ports)
					v.set({type: t});
				} else {              // check data type
				   if (type(v).unsigned===false || type(v).size!==t.size) {
					   setLog("Warning: "+pos+" binary assignment size difference");
				   }
				}
			}	
		}
		
		globPrevStatement="a";
		
		//V31 check and parse conditional when-else 
		let t = peek();
	    if (peek().id==="when") {
			globCurStatement="b";
			consume();			

			let whenSt = new IfStatement(); // create if statement
            
			whenSt.set({level: Number(level)}); 
			if (level===0 && op==="=") { // set ifType=1 (when..else) level 0 comb
				whenSt.set({ifType: 1});
			}
			stat.setPos(pos);               // set statement position
			stat.pushBlock();  // define next block level
			
			// create new blocks, set level+1
			let ifBlok = new Blok(stat.blockName());
			ifBlok.set({level: (Number(level)+1)});
			
			a.set({level: Number(level)+1}); // change assignment statement level
			ifBlok.push(a);  // and push to if block
			
			whenSt.setExpr(condition()); // parse condition
			
			if (peek().id!=="else") {
				throw parseErr("exp","else");							
			}
			consume(); // consume else
			
			let node2 = new Op({op:"", left:null, right:null});
			node2 = expression(node2);
			
			let a2 = new Statement(op);  // statement, define target, position and level
			a2.setTarget(v);
			a2.setExpr(node2);
			a2.set({pos: pos});
			a2.set({level: Number(level)+1});
			
			let elseBlok = new Blok(stat.blockName()+"e");
			elseBlok.set({level: (Number(level)+1)});
			elseBlok.push(a2);
			
			whenSt.setIf(ifBlok, elseBlok);
			stat.popBlock();
			return whenSt;
		}			
				
		return a;
	}
	
	function takeToken(id) {	
		if (peek().id === id) {consume();}
		else {
			throw parseErr("exp",id);
		}
	}
	
	function boolExp(n) {
		let b = expression(n, true); // set boolRel to true
		return b;
	}
	
	function condition() {
	 let n = new Op({op:"", left:null, right:null});
	 n = boolExp(n);
	 return n;
	}

	// parse conditional statement, pos: position, id="if", "elsif" special case
	function parseIf(pos, id) // oneStatement, elsifStatement) //******** IF ***********
	{		
		let ifst = new IfStatement();
		ifst.set({level: Number(circ.getBlok().get().level)});
		ifst.set({pos: pos});
		if (id==="elsif") {ifst.set({elsif: 1});}
		
		stat.setPos(pos);
		stat.pushBlock(); // increment block level
		
		const blockNameStr = stat.blockName();
		let ifblok = new Blok(blockNameStr); // create new code block
		let elseBlok = null;
		
		let parenth = false;
		
		// parse condition
		if (peek().id==="(") { 
			parenth = true; 
			takeToken("(");
		}		
		ifst.setExpr(condition());		
		if (parenth) {
			takeToken(")");
		}
		
		// detect "else if"
		let detectElseIf = (id==="if" && globPrevStatement==="else") ? true : false;		
		globPrevStatement="if";
		
		let saveBlok = circ.getBlok();
		
		
		let level = saveBlok.get().level;
			
		// set if block level
		if (detectElseIf) {  // "else if" > elsif, reverse level 
			ifst.set({level: (Number(level)-1)});
			ifst.set({elsif: 1});
			ifblok.set({level: (Number(level))});
		} else {
			ifblok.set({level: (Number(level)+1)}); 
		}
		
		let singleStatement = false;
		
		circ.setBlok(ifblok);
		let n = peek().id;

		if (n==="\n" || (setup.syntaxC && n==="{") || (!setup.syntaxC && n==="then")) {	// new line or {, expect new block
			if ((id==="elsif") && saveBlok.get().oneline===true) {
				{throw parseErr("Only single statement allowed in if-elsif !");} // Single line if followed by block elsif
			}			
			skipSeparators();
			setup.syntaxC ? takeToken("{") : takeToken("then");					
			parseBlock(ifblok, "");			
			if (setup.syntaxC) {takeToken("}");}
		} else {
			if (parenth) {
				singleStatement = true; // one statement block
				parseBlock(ifblok, "?");
			} else {
				throw parseErr("exp", "then");
			}
		}
		
		if (!singleStatement) { // skip new line if not single statement
		  skipSeparators();	
		}
		
		if (peek().id==="else") {
			consume();
			elseBlok = new Blok(blockNameStr+"e");
			
            globPrevStatement="else";
			if (detectElseIf) {
				elseBlok.set({level: (Number(level))}); 
			} else { 			
				elseBlok.set({level: (Number(level)+1)}); 
			}
			circ.setBlok(elseBlok);	
			n = peek().id;	
			if (n==="\n" || n==="{" || !singleStatement) {	// if not one statement block
			    if (setup.syntaxC && n==="{") {takeToken("{");}
				parseBlock(elseBlok);				
				if (setup.syntaxC) {takeToken("}");}

			} else {				
				if (n==="if") parseBlock(elseBlok, "if");
				else parseBlock(elseBlok, "?");  
			}			
		} else if (peek().id==="elsif") {			
			elseBlok = new Blok(blockNameStr+"e");
			elseBlok.set({level: (Number(level))});
			if (singleStatement) {elseBlok.set({oneline: true});}
			circ.setBlok(elseBlok);	
			parseBlock(elseBlok, "elsif"); // elsif is a one statement else block			
		}
		
		ifst.setIf(ifblok, elseBlok);
		circ.setBlok(saveBlok);
		stat.popBlock();
		
		if (!singleStatement && !(id==="elsif")) { // parse block end, if not one statement
			skipSeparators();
			if (!setup.syntaxC) takeToken("end");
			//setup.syntaxC ? takeToken("}") : takeToken("end");
		}
		
		return ifst;
	}	

	function parseInstance(pos, id)
	{
		takeToken("(");
		let varid = parseVarList();
		takeToken(")");
		
		let i=0;
		while (circ.labels.includes("u"+i)) { 
			i +=1;
		}
		circ.labels.push("u"+i);
		
		st = new Instance(id, "u"+i);
		st.set({pos: pos});
		stat.setPos(pos);
		varList = new Array();
		varid.forEach(function (ident) {
			varList.push(circ.getVar(ident));
		});
		
		st.set({varList: varList});		

		return st;
	}
	
	// b=block
	function parseStatement(b) // parse & return known statement or null, b = Blok()
	{		
		let statement = null;
		let isSlice = false;
        let isSliceNum = -1;
		let indexID = "";
		
		skipSeparators();		
		let t = peek();
		
		globCurStatement=""; // reset current parsed statement
		//if (t.id === endKey) {return null;}
		
		if (t.id==="if") {      // if statement
			let pos = t.pos();			
			consume();			
			statement = parseIf(pos, ""); // return statement or undefined 
		} else if (t.id==="}" || t.id==="else" || t.id==="elsif" || t.id==="end") {   // block end/separator, return witout parsing
			return null;
		} else if (t.isID()) { // identifier		
		  let pos = t.pos();
		  let id = consume().id; // save first identifier
		  let delimiter = peek().id;		  
		  if (peek().id === "(") {     // variable slice or instance
			if (!circ.vars.has(id)) {  // not in variable list, parse port map instance
				if (circ.getBlok().get().name !== "1") {throw parseErr("Instance is not allowed in nested blocks!");}
				statement = parseInstance(pos, id);
				return statement;
			}
		  
			isSlice = true;
			consume();
			t=peek();
			if (t.isID()) { // slice with index variable

				indexID = consume().id;							
				t=peek();
				if (t.id===")") { consume(); }
				else {throw parseErr("exp",")");}
            } else if (t.isNum()) { // bit from vector variable
                isSliceNum = consume().id;                         
                t=peek();
				if (t.id===")") { consume(); }
				else {throw parseErr("exp",")");}
			} else { //V33
				throw parseErr("expvi"); // TODO: expected variable index
			}
		  }
		  
		  if (peek().isAssign()) {  // expect assignment
			let v = circ.getVar(id);   // get output var
            
			if (isSlice) {			// transform variable to slice
                const vsize = type(v).size;
                v = new Slice(v);
                if  (isSliceNum===-1) {
					v.sliceSetup(-1, circ.getVar(indexID));
			    } else {
                    if (isSliceNum>=vsize) {throw parseErr("slice",")");} 
					v.sliceSetup(isSliceNum, isSliceNum);
                }
			}
			if (mode(v)==="in") {
				throw parseErr("tin", id); //Assignment target: '"+id+"' is input signal!");
			}
            if (mode(v)==="const") {
                throw parseErr("tcon", id);
            }
			
			let op = consume().id;
			statement = parseAssign(b, v, op, pos); // return statement or undefined
						
			if (op==="<=") {circ.setSeq(true);}
		  } else { 	  
			throw parseErr("exp", "=");  //"Unexpected token: '"+peek().id+"'!"
		  }		  
				
		} else if (t.id==="{") {
			throw parseErr("unexp", "{");			
		
		} else {
			if (!t.isEOF()) { throw parseErr("unexp", t.id); }//parseErr("Unexpected token: '"+t.id+"'!"); }
		}
      
		return statement;		
	}
	
	// parse block of statements and save statements
	// if (statementID!==undefined) parse one statement or specific statement (if, elsif)
	// if (syntaxC) parse block delimiters TODO: '{' and '}'
	function parseBlock(b, statementID) {    // b = Blok(), oneStatement: bool
		let t = peek();
		let statement = null;
//setLog("B"+b.get().name);		
		if (statementID) {				
			let pos = t.pos();
			if (statementID==="if" || statementID==="elsif") {
				consume();
				statement = parseIf(pos, statementID);
			} else {
				statement = parseStatement(b);
			}
			if (statement!==null) {
				b.push(statement);
			}
		} else {
			while (t.isSeparator()) { consume(); t=peek();}			
			do {
				statement = parseStatement(b);
				if (statement!==null) {
					b.push(statement);
				}
				t = peek();	
				if (t.isEOF()) {break;}
				if (t.id==="end" || t.id==="}") {break;}
				if (t.id==="else" || t.id==="elsif") {break;}
			} while (true);  // isEnd > isEOF

// V3.6 ADD at the end of block
            if (b.get().name==="1") {
                if (rtlStat.length>0) 
                    for (let i in rtlStat)
                        b.push(rtlStat[i].st);
                    
                if (defStat.length>0) 
                    for (let i in defStat)
                        b.unshift(defStat[i].st);
            }
		}
	}
	
  // parse and return a list of variable names	
  function parseVarList()
  {
	let id = consume().id;     // consume first id	
	let varid = new Array(id);
	let delimiter = peek().id;
	
	while (delimiter===",") {
		consume();
		if (peek().isID()) {
			id = consume().id;
			varid.push(id);
			delimiter = peek().id;
		} else {
			throw parseErr("Expected identifier in a list! '"+peek().id+"'");
		}
	}
	
	return varid;
  }

  function parseEntity(toplevel)
  {
	let circuitName = setup.defName;
	let beginBlock = false;	
	let hasEntity = false;

		 
	skipSeparators(); // skip initial separators
	// parse optional circuit name (entity name) 	 
	if (peek().id==="entity") {
		consume();
		if (peek().isID()) {
			circuitName = consume().id;
			hasEntity = true;
		} else {
			throw parseErr("Entity name error! ");
		}		
		skipSeparators();
    } 
	
	circ = new Circuit(circuitName, toplevel);
	circ.entity = hasEntity; // V3.5
	
	let portsTable = new Map();	
	if (!circ.entity) getPorts(); // V3.5 
	
	if (peek().id==="begin") {  // parse circuit block declaration
		consume();
		beginBlock = true;
	} else if (peek().isID()) { // test for and parse declarations
        let sign = 1;		
		do {
            let firstID = peek().id;
			if (peekNext().id===":" || peekNext().id===",") {
			  // detect declaration, parse varList...
			  let varid = parseVarList();
			  takeToken(":");
			  
			  let vmode = "";

			  let vmem = false;
			  let numArray = [];
              let vtype = ""; // V33 variable enum type
              let vinit = false;
              let init = [0, 0]; // default var initial value
			  
              // is first identifier mode?
			  if (peek().id==="in" || peek().id==="out") { // read signal mode
				vmode = consume().id;
			  } 
              let vtypeStr = peek().id; // first or second identifier, uN, sN, ....
              
			  if (peek().isNum()) {  // parse array declaration (start with number)
				vmem = true;
				let tmp = consume().id;							
				if (!peek().isTypeID()) {throw parseErr("Unknown data type in array declaration!", id);}
				if (Number(tmp)<1 || Number(tmp)>1024) {throw parseErr("Unsupported size of array declaration (1-1024)!", id);}
				
				tmp = tmp.concat(consume().id);
				vtypeStr = tmp;
               
				if (vmode!="") {throw parseErr("Mode in/out not allowed in array declaration!", id);}

				if (peek().id === "=") { // assignment	
					
					let n = 0;
					
					const id = consume().id;
					sign = 1;  // default sign
					if (peek().id ==="-") {
						sign = -1;
						consume().id;
					}
					
					if (!peek().isNum()) {throw parseErr("Expected number list!", id);}
					// v3.5 convert signed integer to appropriate vector !!
					const typeObj = parseTypeID(vtypeStr);
					const initValue = sign*Number(consume().id);

					if (vec.testRange(initValue, typeObj)===false) {
						setLog("Warning: "+peek().pos()+" assigned constant out of range "+vtypeStr+" !" );
					}
					
					numArray.push([initValue,0]);
					while (peek().id === ",") {
						consume().id;
						while (peek().id === "\n") {consume().id;} // skip new line (line separated list)
						sign = 1;
					    if (peek().id ==="-") {
						  sign = -1;
						  consume().id;
					    }
						if (!peek().isNum()) {throw parseErr("Expected number list!", id);}
						const itemValue = sign*Number(consume().id);
						if (vec.testRange(itemValue, typeObj)===false) {
							setLog("Warning: "+peek().pos()+" assigned constant out of range "+vtypeStr+" !" );
						}						
						numArray.push([itemValue,0]);						
					}
				}
			  } else if (peek().id === "(") { // V33 check for state enum (s1, s2)
                takeToken("(");
                if (peek().isID()) {                    
                    vtype = "t_"+firstID;
                    let stateid = parseVarList();
                    const stBits = Math.ceil(Math.log2(stateid.length));
                    vtypeStr = "u"+stBits;
                    const typeQual = "c"+vtype; // enum constants: c_ + vtype
                    
                    let val = 0;
                    stateid.forEach(function (stid, i) {
                        let obj = parsePorts(stid, "sig", vtypeStr, 1);                    
                        circ.setPorts(stid, obj);
                        
                        if (circ.vars.has(stid)) {throw parseErr("decl", stid);}
                        let v = circ.getVar(stid);

                        v.set({mode: "const"});
                        v.set({hdl: {mode: "const", val: val}});  //v.set({hdl: {val: enumVal}});
                        v.set({type: {qual: typeQual}});
                        v.setVal(vec.parse(val));
                
                        val += 1;
                    });
                    
                } else {
                    throw parseErr("Expected symbol list!");
                }
                takeToken(")");
			  } else {
				vtypeStr = consume().id;
                if (peek().id === "=") { // assignment of initial value V32
                    vinit = true;
					const tok = consume();
                    const id = tok.id;
					
					sign = 1;  // default sign
					if (peek().id ==="-") {
						sign = -1;
						consume().id;
					}					
                    if (!peek().isNum()) {throw parseErr("explit", id);}
					// v3.5 convert signed integer to appropriate vector !!
					const typeObj = {unsigned: vtypeStr.slice(0,1)==="u", size: parseInt(vtypeStr.slice(1))}
					const initValue = sign*Number(consume().id);

					if (vec.testRange(initValue, typeObj)===false) {
						setLog("Warning: "+tok.pos()+" assigned constant out of range!");
					}
					init=vec.int2vector(initValue,typeObj);					 
                }
			  }
			  
			  let declared = 1;			  
			  
			  varid.forEach(function (ident, j) {
				  // check if not already in ports
				  if (circ.ports.has(ident)) { // already declared					  
					  throw parseErr("decl", ident);
				  }
				  
				  declared = (j === varid.length-1) ? 1 : 2;			  
				  let obj = parsePorts(ident, vmode, vtypeStr, declared)
				  if (portsTable.has(ident)) { // check for portsTable declaration mismatch if not u0 (V33)
                    if ((portsTable.get(ident).type.size!==0) && 
                        ((obj.type.unsigned!==portsTable.get(ident).type.unsigned) ||
						 (obj.type.size!==portsTable.get(ident).type.size) ||
						 (obj.mode!==portsTable.get(ident).mode))) {		  
						throw parseErr("Signal '"+ident+"' declaration type/value mismatch");
					}	
				  }
				  
                  // add init attribute
				  if (vmem) {
					if (numArray.length!=0) { obj.init = numArray; }
				  } else if (vinit) {
                      obj.init = init;
                  }  

				  circ.setPorts(ident, obj);	// set port properties

				  if (circ.vars.has(ident)) {throw parseErr("decl", ident);}				  
				  let v = circ.getVar(ident);

                  if (vtype!=="") { // V33 set qual
                    v.set({type: {qual: vtype}});
                  }                  
			  });
				
			  skipSeparators();
			  
			} else {
				break;
			}
		} while (peek().isID());
		if (peek().id==="begin") {  // parse circuit block declaration
			consume();
			beginBlock = true;
		}
	}
// V31 after declarations, get undeclared items from html port table
    if (toplevel) {
        portsTable.forEach(function (val, id) {
            if (!circ.ports.has(id)) {
              circ.ports.set(id, val); // add ports and vars table		  
              if (circ.vars.has(id)) {throw parseErr("decl", id);}
              else {circ.getVar(id);}
            }
        });
    }
	
    //mainBlock = circ.getBlok(); // V3.6
	parseBlock(circ); // main: parse circuit block
	
	if (beginBlock===true) {takeToken("end");}   
  }
	
try {
console.log("Begin Parse");	  
	clearLog();
	stat.init(); 
    if (resEnabled) resEst.init();	

	parseEntity(true); // parse top level circuit, save to circ
	
	skipSeparators();
	
	if ((peek().id==="entity")) {
		let save_circ = circ;
		parseEntity(false);
		
		// save parsed circuit model to instance statement
		let b = save_circ.getBlok();
		b.statements.forEach(function(st) {
			if (st.get().id==="inst") {
				st.set({source: circ});
			}
		});
		circ = save_circ; // restore the current circuit model
		skipSeparators();
	} 
	
	if (!(peek().isEOF())) {
		if (peek().id==="end") { setLog(parseErr("Unexpected 'end'!")); }
		else { setLog(parseErr("Misplaced code after end of block !")); }
	}


	disablePort(circ.entity); // V3.5, disable mode,type, if circuit has entity
	updatePortTable();
console.log("Begin Visit");

	   let logStr="";
	   
	   if (circ.entity) logStr += "entity "+circ.name()+"\n";	   
	   logStr += circ.visit(1); // visit, first pass
	   
       //logStr = resEst.emit();
       if (resEnabled) {
        resEst.opt();
        logStr += "\n--- Dataflow graph ---\n"+resEst.emit();
       }
	   document.getElementById("codevisit").innerHTML = logStr; //+"\n"+resEst.emit()+"\n";
       
	  let v;
	  let mod;
	  
	  stat.getSet(Resource.FF).forEach(function(id) {  // calculate number of FFs
	      stat.incNum(type(circ.getVar(id)).size, Resource.FF);
	  });
	  
	  // check ports usage, note: in used as out checked at assignment visit,
	  //   out used as inout solved at 2nd pass visit
	  circ.ports.forEach(function (val, id) {		  
		v = circ.getVar(id, true);
//setLog("Var: "+id);  // V3.5
//setLog("Var: value "+v.val()[1]+","+v.val()[0]);
		if (v!==null) {
			mod = mode(v);			
			if (mod==="out" && hdl(v).mode==="in") {  // wrong declaration or usage
				throw modelErr("vin", id); // Signal should be declared as input
			}
		}
	  });
	  
	  // vars check and I/O resource usage
	  // TODO: allow multiple stateVars
	  let undeclaredIn = 0;
	  let undeclareIds = "";
	  let stateVar = "";
	  let nameList = [];
	  
	  circ.vars.forEach(function (val, id) {
		let mod = mode(val); //val.getMode();
		let mod1 = hdl(val).mode;
        let varInit = val.get().setInit;
        
		const varIsArray = (type(val).qual==="array");
		
		if (mod1===undefined) {mod1 = "";}
		if (mod==="") { // test internal signals			
			if (mod1==="" || mod1==="out") {			
				if (!circ.ports.has(id) && setup.convUnused) {					
					setLog("Note: convert unused: "+id+" to output");
					let obj = parsePorts(id, "out", typeToString(type(val)), 1); 
					circ.setPorts(id, obj);	
					//const v = circ.getVar(id, true); // TODO v === val ??
					val.set({mode: "out"});
					
				} else {
                    if (varInit) { // V33a varInit => to constant  V3.5 correct!!
                        val.set({hdl: {mode:"const", val: vec.out(val.get().init)}});
                        setLog("Note: unused constant: "+id);
//setLog(val.get().init);						
                    } else {
                        setLog("Note: unused signal: "+id);
                    }
				}
			}
			
			if (mod1==="in") { // && !varIsArray) { // if used as input and is not array
				if (!circ.ports.has(id) && setup.convUnused) {
					setLog("Note: convert unused: "+id+" to input");										
					let obj = parsePorts(id, "in", typeToString(type(val)), 1);
					circ.setPorts(id, obj);					
					val.set({mode: "in"});					
				} else {                    
                    if (varInit) { // V33a varInit => to constant
                        val.set({hdl: {mode:"const", val: vec.out(val.get().init)}});
                    } else {
                        if (undeclareIds==="") {undeclareIds = id;}
                        else {undeclareIds += ","+id;}					
                        //setLog("Note: variable: "+id+" should be declared as input!");
                        undeclaredIn += 1;
                    }
				}
			}			
		}
		
		if (mod==="in" || mod==="out") {
			stat.incNum(type(val).size, Resource.IO);
		}
		if (hdl(val).assignments>1) {
			stat.incNum(1, Resource.MUX);
		
			// search for stateVar: <=, only undefined input variable assigments 
			if (hdl(val).assignop==="<=" && hdl(val).names.size>1) {
				let test = 0;
				hdl(val).names.forEach(function (varName) { // browse all variable names
					vn = circ.getVar(varName, true);
					if (vn!==null) {					
						mod = mode(vn);			
						if (mod==="" && hdl(vn).mode==="in") {
							if (test===0) {nameList = [];}
							test += 1;
							nameList.push(varName);
						} else {
							test = 0;
							
						}
					}
				});
					
				//const firstName = hdl(val).names.values().next();
				//setLog("Check:"+firstName.value );
				//const v1 = circ.getVar(hdl(val).names[0], true);
				//if (mode(v1)==="" && hdl(v1).mode==="in") {
				if (test>0) {
					stateVar = id;
				}
				//}
			}			
		}		
	  });

	if (undeclaredIn>0) {
		setLog("Note: signal: "+undeclareIds+" should be declared as input!");
	}

	if (stateVar!="") {
		nameList.sort();
		setLog("Enumerating identifiers: "+nameList);
		let enumVal = 0;
		nameList.forEach(function (varName) {
			v = circ.getVar(varName, true);
			v.set({hdl: {mode: "const"}});
			v.set({hdl: {val: enumVal}});
			v.setVal(vec.parse(enumVal));
			
			enumVal += 1;
		});
	}

	  setStat(stat.emit());	  
	  
	  if (log) {
		let sigmode = "";
		let as = "";
		console.log(logStr);  // log parsed tree and signals		
		console.log("Sequential: "+circ.getSeq());
		
		console.log("Signals: ");
		circ.vars.forEach(function(v) {
			sigmode = ",";
			if (hdl(v).mode!==undefined) sigmode=","+hdl(v).mode;
			as = ",";
			if (hdl(v).assignop!==undefined) {as=","+hdl(v).assignop+hdl(v).assignments;}
console.log(v.visit(-1)+":"+type(v).id+" "+ //" val="+vec.out(v.val(), type(v).unsigned)+" mode="+mode(v)+" type="+
			typeToString(type(v))+sigmode+as+" "+type(v).qual);
		});
	  }

    // V33 
    let typeSet = new Set();
    let s = "";
    
      circ.vars.forEach(function (val, id) {
      if (type(val).qual[0]==="t") {
        let typeConst;
        let key = "";
        if (!typeSet.has(type(val).qual)) {
         typeSet.add(type(val).qual);
         key = type(val).qual;
         typeConst = [];
         s += " type "+type(val).qual+" (";
         const enumQual="c"+type(val).qual;
         
         circ.vars.forEach(function (val2, id2) {
            if (type(val2).qual===enumQual) {
                typeConst.push(val2.get().name);
                s += val2.get().name+" ";
            }
         });
         s += ")";         
        }
        circ.qType.set(key, typeConst);
        if (log) {
            console.log(s);
        }
      }        
      });	
    
    
	  setLog("Parse finished.");
      
      if (logParse) {
         logPorts(circ);
         logVars(circ);    
      }
      
	  parseButton(1);	  
	  model = circ; // set circuit model
	  
	  
 } catch(er) {
	  setLog(er);
	  console.log("Error: "+er);
	  model = undefined;
  } 
}

function runCycle(tree, i) {
  try {    
	console.log("Run cycle "+i);
	
	let result = tree.val(i); // simulate, cycle: i
	if (result===undefined) {
		console.log("Run cycle: End.");
		return false;
	}
	
	tree.ports.forEach(function (p, id) {
		if (tree.vars.has(id)) {
			if (p.mode==="out" || p.mode==="") {
			  const v= tree.vars.get(id);	
              const dat = vec.out(v.val(), type(v).unsigned);
			  setSignal(i, id, dat);
               if (boardSim) { // V34 Board support
                const i = boardDes.outNames.indexOf(id); // > -1
                if (i>-1) {
                    boardDes.outValues[i] = dat; 
                }
               }           
			}
			
		}
	});	
	console.log("End");
	return true;
  } catch(ex) {
	setLog(ex);
	console.log("Runtime: "+ex);  
  }
}

function run() // ?? V34 cy, če je undefined ali -1, čez vse
{
  let d = 0;  //(cy>=0 && <MAXCYC) ? cy : 0;
  let res = false;
  
  if (model===undefined) {return;}
  if (model.changed()) {parseCode();}
  
  setLog("Run...");  
  
  if (model) {res = runCycle(model, d);}
  
  while (res===true && d<MAXCYC) {
	d += 1;
    res = runCycle(model, d);
  }
  setLog("End.");
}
