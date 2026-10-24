// The four Guild branches, with the logos the Guild supplied (cropped, under /public/branches). The branch card on the Join page
// shows the logo (its alt text is the branch name); a branch with no logo shows the name alone.
const BASE=(import.meta.env&&import.meta.env.BASE_URL)||'/';
const logo=id=>BASE+'branches/'+id+'.png';
export const BRANCHES=[
  {id:'beauty',name:'Beauty Therapists',logo:logo('beauty')},
  {id:'holistic',name:'Holistic Therapists',logo:logo('holistic')},
  {id:'nails',name:'Nail Technicians',logo:logo('nails')},
  {id:'hair',name:'Hairdressers & Barbers',logo:logo('hair')},
];
// The Guild of Therapy Lecturers is the primary branch given to someone who joins through an accreditation. It is not offered on the Join page.
export const LECTURERS_BRANCH={id:'lecturers',name:'Therapy Lecturers',logo:logo('lecturers')};
export const branchName=id=>BRANCHES.find(b=>b.id===id)?.name||id;
