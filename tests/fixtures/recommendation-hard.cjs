'use strict';
// Authored paraphrases against the same fixed catalog. These test ranking;
// retrieval routes have their own development coverage checks.
const hard=[
 ['A company divides workers memories between their job and their life at home',['Severance']],
 ['A man loses his ability to form new memories and leaves himself clues',['Memento']],
 ['A father and daughter age at different rates during an interstellar rescue mission',['Interstellar']],
 ['An expert in linguistics must decode messages from visitors to Earth',['Arrival']],
 ['Someone survives on a barren planet by farming and solving engineering problems',['The Martian']],
 ['Two performers destroy their personal lives trying to perfect a stage illusion',['The Prestige']],
 ['People at a wedding discover they are stuck living that day repeatedly',['Palm Springs']],
 ['A reluctant weatherman has endless chances to improve one day',['Groundhog Day']],
 ['A soldier repeats a deadly battle and learns from each failed attempt',['Edge of Tomorrow']],
 ['A man notices his friends and neighbors may all be actors playing a part',['The Truman Show']],
 ['A schoolteacher with cancer starts a dangerous business making drugs',['Breaking Bad']],
 ['Three true crime fans become amateur investigators after a neighbor dies',['Only Murders in the Building']],
 ['A person who has lived selfishly gets a chance to study ethics after death',['The Good Place']],
 ['A gentle American sports coach helps a struggling British club',['Ted Lasso']],
 ['Teenagers in a small town uncover experiments and a frightening alternate dimension',['Stranger Things']],
 ['Rival factions on Earth Mars and the asteroid belt face a mysterious conspiracy',['The Expanse']],
 ['A child goes missing and families find their histories are connected across time',['Dark']],
 ['A restaurant worker leaves his job and takes his son on a food truck adventure',['Chef']],
 ['A girl’s relatives drive a battered van to get her to a pageant',['Little Miss Sunshine']],
 ['A robot must protect a boy from a more advanced assassin sent from the future',['Terminator 2: Judgment Day']],
 ['A group cannot tell which colleague has been replaced by an alien in a frozen research base',['The Thing']],
 ['A family’s survival depends on not making any sound',['A Quiet Place']],
 ['A human evaluator is manipulated by an artificial woman during a private experiment',['Ex Machina']],
 ['A janitor’s remarkable mathematical gift clashes with his emotional wounds',['Good Will Hunting']],
 ['Two competitors who own bookstores secretly write loving messages to each other',["You've Got Mail"]],
 ['A glamorous actress dates an unassuming London shopkeeper',['Notting Hill']],
 ['A wealthy disabled man and an unconventional carer form a warm friendship',['The Intouchables']],
 ['A detective’s investigation inside a mental hospital unravels his own reality',['Shutter Island']],
 ['A group of thieves wants to empty the vaults of several Las Vegas casinos',["Ocean's Eleven"]],
 ['A mother’s difficult relationship with her daughter unfolds across alternate universes',['Everything Everywhere All at Once']]
].map(([query,expected])=>({query,expected}));
const negative=[
 'A nature documentary about coral bleaching and reef restoration',
 'An animated rat dreams of becoming a chef in a Paris restaurant',
 'A lawyer investigates a town’s drinking water being poisoned by a corporation',
 'An archaeologist races Nazis to recover the Ark of the Covenant',
 'A drummer is pushed to breaking point by a ruthless jazz teacher',
 'An orphaned girl becomes a competitive chess prodigy while battling addiction',
 'A silent comedy where a tramp befriends a blind flower seller',
 'An animated boy befriends a dragon instead of hunting it'
].map(query=>({query,expected:[]}));
module.exports={hard,negative};
