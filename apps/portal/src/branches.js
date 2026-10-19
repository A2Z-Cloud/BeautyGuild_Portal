// The four Guild branches. Set `logo` to a path under /public (for example '/branches/beauty.svg') and the branch card on the Join
// page shows it; with no logo the card shows the name alone.
export const BRANCHES=[
  {id:'beauty',name:'Beauty Therapists',logo:null},
  {id:'holistic',name:'Holistic Therapists',logo:null},
  {id:'nails',name:'Nail Technicians',logo:null},
  {id:'hair',name:'Hairdressers & Barbers',logo:null},
];
export const branchName=id=>BRANCHES.find(b=>b.id===id)?.name||id;
