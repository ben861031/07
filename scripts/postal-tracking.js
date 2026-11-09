(function(root){
  const digits=value=>String(value??"").replace(/[\s-]/g,"").trim();
  const validSuffix=value=>/^\d{8}$/.test(digits(value));
  const validFull=value=>/^(?:\d{14}|\d{20})$/.test(digits(value));
  function fullNumber(item,batch){
    const override=digits(item?.postalTrackingNo);
    if(validFull(override))return override;
    const short=digits(item?.trackingNo);
    if(validFull(short))return short;
    const suffix=digits(batch?.postalSuffix8);
    return /^\d{6}$/.test(short)&&validSuffix(suffix)?short+suffix:"";
  }
  const api={digits,validSuffix,validFull,fullNumber};
  root.PostalTracking=api;
  if(typeof module!=="undefined")module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
