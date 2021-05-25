/*File: vector.js, define 2x32 bit signed/unsigned vector and operations */
/*jshint esversion: 6 */
/*jslint bitwise: true */
const maxN = 4294967295; 
const veclog = true;

function Vector() { // storage Array obj: 1:MSB, 0:LSB
  const zero = [0, 0];
  const one = [1, 0];
  let obj = [0, 0];

  function isZero(v) {
	  return v[1]===0 && v[0]===0;
  }
  
  function hex(h) {
	if (h[1]===0) {
		return "0X"+(h[0] >>> 0).toString(16);
	} else {
		const low = (h[0] >>> 0).toString(16);
        return "0x"+(h[1] >>> 0).toString(16)+("0".repeat(8 - low.length)) + low;
	}
  }

  function int2vector(i, type) {
//setLog("int2vector "+i+" "+type.unsigned+type.size);
    if (type.unsigned) return [i, 0];
	else {
		if (i>0) return [i, 0];
		else {		  
		  return [i, 0xFFFFFFFF];
		}
	}
  }
  
  function testRange(i, type) {
	if (type.unsigned) {
	  if (i<0 || i>Math.pow(2,Math.abs(type.size))-1) return false;	
	} else {
	  if (i<-Math.pow(2,Math.abs(type.size-1)) || i>Math.pow(2,Math.abs(type.size-1))-1) return false;	  
	}
	return true;
  }
  
  function parse(str) { // string to vector
	let n = parseInt(str);
	
	if (n <= maxN) {return [n, 0];}
	return [n % (maxN+1),  Math.floor(n / (maxN+1))];
  }
  
  // string (number) representation of vector
  //  if < 32 bit, return decimal number, else return hex due to JS loss of precision
  function out(o, unsigned) {
	if (unsigned) {
		if (o[1]===0) {return o[0].toString();}
		return hex(o);
	} else {
		if (o[1]===0) {return o[0].toString();}
		if (o[1]===0xFFFFFFFF) { // neg, <= 32 bit
		    const n = o[0] >> 0; // to signed integer
			return n.toString();
		}		
		return hex(o);
	}
  }
  
  function complement(c) {
	const a = [~c[0], ~c[1]];
	
	return op("+",a, [1,0]);
  }
  
  function mask(n) {
	let i = 1;
	let index = 0;
	let m = [1, 0]; // mask seed for n<=32

	if (n>32) {
		m = [0xFFFFFFFF, 1]; 
		index = 1;
		n -= 32;
	}

	while (i < n) {
		m[index] += (1 << i);
		i += 1;
	} 
	
	return m;
  }
	
  function shiftLeft(a, n) {
	let r = [0, 0];
	const bits = (n<32) ? n : n-32;
	const m = mask(32-bits);
	
	if (n < 32) {	
		r[0] = ((a[0] & m[0]) << bits) >>>0;
		const rem = (a[0] & ~m[0])>>>(32-bits);	
		r[1] = (((a[1] & m[0]) << bits) | rem) >>>0;
	} else {		
		r[1] = ((a[0] & m[0]) << bits) >>>0;
	}
	return r;
  }
  
  function shiftRight(a, n) { // test for < 32 bits
	let r=[a[0], a[1]];
	const m = mask(n);
	
	r[0] = ((r[1] & m[0]) << (32-n)) | (r[0] >> n)
	r[1] = (r[1] >> n);
	
	return r;
  }

  function sll(a, b) // amount b should be less than 32 bit 
  {
      n = b[0]; 
      if (b[1] & 0x80000000 !== 0) { // change shift for negative values
          return shiftRight(a, -n);
      }
      
      return shiftLeft(a, n);
  }
  
  function srl(a, b) // amount b should be less than 32 bit 
  {
      n = b[0];
      if (b[1] & 0x80000000 !== 0) { // change shift for negative values
          return shiftLeft(a, -n);
      }
      
      return shiftRight(a, n);
  }  
	
  function concat(a,b, sizeB) { // concat
    const left = {...a};
	return or(shiftLeft(left, sizeB), b);
  }
	
  function add(a,b) { // compute sum, convert to int32
	let r = [0, 0];

	r[0] = a[0] + b[0];
	if (r[0] > maxN) {
		r[1] = (a[1] + b[1] + 1) >>> 0;
		r[0] >>>= 0;  // to Uint32
	} else {
		r[1] = (a[1] + b[1]) >>> 0;
	}		
	if (veclog) {console.log("add res="+vec.hex(r));}
    return r;  
  }
  
  function sub(a,b) {
	 let r = [0, 0];
	 r[0] = a[0] - b[0];
	 
	 if (r[0]<0) {
		r[1] = (a[1] - b[1] - 1) >>> 0;		
		r[0] >>>= 0;  //obj[0] += (maxN+1);  
	 } else {
		 r[1] = (a[1] - b[1]) >>> 0;
	 }
	 if (veclog) {console.log("sub res="+vec.hex(r));}
	 return r;
  }
  
  function mul(m1, m2) { // unsigned multiply, limit: 32 bit inputs!
	let result = [0,0];
	let tmp = 0;

	let mult1 = {...m1};
	let mult2 = {...m2};
	let unsigned = true;
//console.log("Mult low: "+mult1[0]+" * "+mult2[0]);

	if (m1[1] & 0x80000000 !== 0) {	// complement negative value
		mult1 = add([~m1[0], ~m1[1]], [1,0]);    //op("+",[~m1[0], ~m1[1]], [1,0]);
		unsigned = !unsigned;
	}	

	if (m2[1] & 0x80000000 !== 0) {
		mult2 = add([~m2[0], ~m2[1]], [1,0]); //op("+",[~m2[0], ~m2[1]], [1,0]); // = complement(m2);
		unsigned = !unsigned;
	}
//console.log("Mult low: "+mult1[0]+" * "+mult2[0]);	

	if (mult1[1]===0 && mult2[1]===0) {
		if (mult1[0]<=65535 || mult2[0]<=65535) { // one operand < 16 bit, OK			
			tmp = mult1[0]*mult2[0];			
			if (tmp > maxN) {
				result[1] = Math.floor(tmp / (2**32)); 
				result[0] = tmp % (2**32); 
			} else {
				result[0] = tmp;
			}
		} else { // divide b into 16 bit chunks, compute partial product b1, b2
			let b1 = mult1[0] * (mult2[0] & 0xFFFF);
			let b2 = mult1[0] * (mult2[0] >> 16); // 48-bit

			let t1 = [(b1 & 0xFFFFFFFF)>>>0, Math.floor(b1 / 2**32)];
			let t2 = [((b2 & 0xFFFF)<<16)>>>0, Math.floor(b2 / 2**16)];
			result = add(t1, t2); //  op("+",t1,t2);
		}
		
	} else {
	 if (veclog) {console.log("mul input > 32 bit");}		
	}
	
	if (!unsigned) { // add multiply sign
		result = complement(result);
	}
	
	return result;
  }
  
  function and(a, b) {
	const o = [a[0], a[1]];	
    return o.map((o,i) => o & b[i]);
  }
  
  function or(a, b) {
	const o = [a[0], a[1]];
	return o.map((o,i) => o | b[i]);  
  }
  
  function xor(a, b) {
	const o = [a[0], a[1]];
	return o.map((o,i) => o ^ b[i]);  
  }
  
  function xnor(a, b) {
	const o = [a[0], a[1]];
	return o.map((o,i) => ~(o ^ b[i]));  
  }
  
  function not(a) {
    const o = [a[0], a[1]];	  
	return o.map(o => (~o));  // ? >>>0
  } 
  
  function unary(operation, x) {
	if (operation==="-") {return sub(zero, x);}
	if (operation==="~") {return not(x);}
	if (veclog) {console.log("ERR in Vector: unknown unary op!");}
  }
  
  function op(operation, leftOp, rightOp) {
	const left = {...leftOp};   //[l[0], l[1]];  
	const right = {...rightOp}; //[r[0], r[1]];  
	switch (operation) {
		case "+": return add(left, right);
		case "-": return sub(left, right);
		case "*": return mul(left, right);
		case "&": 
		case "&&":return and(left, right);
		case "|": 
		case "||":return or(left, right);
		case "^": return xor(left, right);
        case "~^": return xnor(left, right);
        case "<<": return sll(left, right);
        case ">>": return srl(left, right);
		default: {
			if (veclog) {console.log("ERR in Vector op!");}
			return zero;
		}
	} 
  }
  
  function cmp(op, leftIn, rightIn, type) {
	  let eq = false;
	  let gt = false;
	  let ls = false;
	  let res = [0,0];
	  	  
	  const m = mask(type.size);  // mask inputs before compare
	  let left = [(leftIn[0] & m[0])>>>0, leftIn[1] & m[1]];
	  let right = [(rightIn[0] & m[0])>>>0, rightIn[1] & m[1]];
	
	  if (type.unsigned===false) {  // signed comparision, extend sign to 32 bits
		if (type.size>32) {console.log("Cmp: signed>32 not supported!");}
		let l = left[0];
		if ((left[0]&(1 <<(type.size-1)))!==0) {l = left[0] | ~m[0];}
		let r = right[0];
		if ((right[0]&(1 <<(type.size-1)))!==0) {r = right[0] | ~m[0];}
		
		eq = (l==r); // compare 32 bit numbers and set cmp flags
		gt = (l>r);
		ls = (l<r);
		
	  } else { // unsigned, set cmp flags for 32+32 bits
		  if (left[1] === right[1]) {
			if (left[0] === right[0]) {eq = true;}
			else if (left[0] > right[0]) {gt = true;}
			else {ls = true;}
		  } else {
			if (left[1] > right[1]) {gt = true;}
			else {ls = true;}
		  }
	  }
	  switch (op) {
		case "==": res = eq ? [1,0]:[0,0]; break;
		case "!=": res = !eq ? [1,0]:[0,0]; break;
		case ">": res = gt ? [1,0]:[0,0]; break;
		case ">=": res = gt|eq ? [1,0]:[0,0]; break;
		case "<": res = ls ? [1,0]:[0,0]; break;
		case "<=": res = ls|eq ? [1,0]:[0,0]; break;
		default: res = [0,0];
	  }
	  if (veclog) {console.log("Vector cmp "+left+" "+op+" "+right+": "+res+" size: "+type.size);}
	  return res;
  }
  
  return {zero, isZero, parse, int2vector, testRange, out, hex, mask, op, unary, cmp, complement, shiftLeft, shiftRight, concat};
}