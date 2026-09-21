// Test content is available only through an explicit developer URL.
export function visibleLibrary(games, search = '') {
  const showFixture = new URLSearchParams(search).get('fixture') === '1';
  return games.filter(game => !game.fixture || showFixture);
}
