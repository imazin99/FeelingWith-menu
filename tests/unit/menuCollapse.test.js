// Collapsible Product Categories (owner-approved enhancement) — the
// decision logic (public/js/menuCollapse.js) was extracted out of
// menu.js specifically so it can be unit-tested directly under Node, with
// no browser/DOM required (same pattern as public/js/money.js +
// tests/unit/money.test.js, and public/js/wheelMath.js +
// tests/unit/wheelMath.test.js). menu.js calls these exact functions
// (confirmed by reading menu.js's renderMenu()/categoryItemsHtml()), so
// this tests the real implementation, not a reimplementation of it.
const MenuCollapse = require('../../public/js/menuCollapse');

describe('MenuCollapse.visibleCount', () => {
  test('0 items: visible count is 0', () => {
    expect(MenuCollapse.visibleCount(0, false, false)).toBe(0);
  });

  test('1 item, collapsed: shows the 1 item (nothing to hide)', () => {
    expect(MenuCollapse.visibleCount(1, false, false)).toBe(1);
  });

  test('2 items, collapsed: shows both (exactly the collapsed threshold)', () => {
    expect(MenuCollapse.visibleCount(2, false, false)).toBe(2);
  });

  test('3 items, collapsed: shows only the first 2', () => {
    expect(MenuCollapse.visibleCount(3, false, false)).toBe(2);
  });

  test('many items (e.g. 8), collapsed: still shows only the first 2', () => {
    expect(MenuCollapse.visibleCount(8, false, false)).toBe(2);
  });

  test('3+ items, expanded: shows all of them', () => {
    expect(MenuCollapse.visibleCount(3, true, false)).toBe(3);
    expect(MenuCollapse.visibleCount(8, true, false)).toBe(8);
  });

  test('expanded flag is irrelevant at or under the collapsed threshold', () => {
    expect(MenuCollapse.visibleCount(2, true, false)).toBe(2);
    expect(MenuCollapse.visibleCount(1, true, false)).toBe(1);
  });

  test('while searching, every item is visible regardless of expanded state or count', () => {
    expect(MenuCollapse.visibleCount(8, false, true)).toBe(8);
    expect(MenuCollapse.visibleCount(3, false, true)).toBe(3);
    expect(MenuCollapse.visibleCount(1, false, true)).toBe(1);
    expect(MenuCollapse.visibleCount(0, false, true)).toBe(0);
  });
});

describe('MenuCollapse.shouldShowToggle', () => {
  test('no toggle for 0, 1, or 2 items', () => {
    expect(MenuCollapse.shouldShowToggle(0, false)).toBe(false);
    expect(MenuCollapse.shouldShowToggle(1, false)).toBe(false);
    expect(MenuCollapse.shouldShowToggle(2, false)).toBe(false);
  });

  test('a toggle is needed for 3 or more items', () => {
    expect(MenuCollapse.shouldShowToggle(3, false)).toBe(true);
    expect(MenuCollapse.shouldShowToggle(8, false)).toBe(true);
  });

  test('never shows a toggle while a search is active, however many items match', () => {
    expect(MenuCollapse.shouldShowToggle(8, true)).toBe(false);
    expect(MenuCollapse.shouldShowToggle(3, true)).toBe(false);
  });
});

describe('MenuCollapse.toggleButtonLabel', () => {
  test('collapsed label names the total count', () => {
    expect(MenuCollapse.toggleButtonLabel(8, false)).toBe('Show All (8)');
    expect(MenuCollapse.toggleButtonLabel(3, false)).toBe('Show All (3)');
  });

  test('expanded label is "Show Less" regardless of count', () => {
    expect(MenuCollapse.toggleButtonLabel(8, true)).toBe('Show Less');
    expect(MenuCollapse.toggleButtonLabel(3, true)).toBe('Show Less');
  });
});

describe('MenuCollapse end-to-end per-category scenarios (0/1/2/3/many items)', () => {
  const scenarios = [0, 1, 2, 3, 4, 9];

  for (const total of scenarios) {
    test(`category with ${total} product(s), collapsed, not searching`, () => {
      const expanded = false;
      const isSearching = false;
      const visible = MenuCollapse.visibleCount(total, expanded, isSearching);
      const showToggle = MenuCollapse.shouldShowToggle(total, isSearching);

      if (total <= 2) {
        expect(visible).toBe(total);
        expect(showToggle).toBe(false);
      } else {
        expect(visible).toBe(2);
        expect(showToggle).toBe(true);
        expect(MenuCollapse.toggleButtonLabel(total, expanded)).toBe(`Show All (${total})`);
      }
    });

    test(`category with ${total} product(s), expanded, not searching: all visible`, () => {
      expect(MenuCollapse.visibleCount(total, true, false)).toBe(total);
    });

    test(`category with ${total} product(s), while searching: all visible, no toggle, regardless of expanded flag`, () => {
      expect(MenuCollapse.visibleCount(total, false, true)).toBe(total);
      expect(MenuCollapse.visibleCount(total, true, true)).toBe(total);
      expect(MenuCollapse.shouldShowToggle(total, true)).toBe(false);
    });
  }
});
