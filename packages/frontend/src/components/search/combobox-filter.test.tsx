import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test-utils/render';
import { ComboboxFilter } from './combobox-filter';

const SUGGESTIONS = ['react', 'typescript', 'node', 'python', 'rust'];

function renderCombobox(
  overrides: Partial<{
    value: string[];
    isMulti: boolean;
    onChange: ReturnType<typeof vi.fn>;
    suggestions: string[];
  }> = {}
) {
  const onChange = overrides.onChange ?? vi.fn();
  render(
    <ComboboxFilter
      value={overrides.value ?? []}
      isMulti={overrides.isMulti ?? true}
      onChange={onChange}
      suggestions={overrides.suggestions ?? SUGGESTIONS}
    />
  );
  return { onChange };
}

describe('ComboboxFilter', () => {
  describe('Given the component is rendered with suggestions', () => {
    describe('When the input is focused', () => {
      it('Then shows top 8 suggestions in the popover', async () => {
        const user = userEvent.setup();
        renderCombobox({ suggestions: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] });

        await user.click(screen.getByRole('textbox'));

        // Top 8 shown (not all 10)
        const items = screen.getAllByRole('button', { name: /^[a-h]$/ });
        expect(items).toHaveLength(8);
      });
    });
  });

  describe('Given the user types in the input', () => {
    describe('When the input matches some suggestions', () => {
      it('Then filters suggestions by case-insensitive substring', async () => {
        const user = userEvent.setup();
        renderCombobox();

        const input = screen.getByRole('textbox');
        await user.click(input);
        await user.type(input, 'ty');

        expect(screen.getByRole('button', { name: 'typescript' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'react' })).not.toBeInTheDocument();
      });
    });

    describe('When the input does not match any suggestion', () => {
      it('Then shows an "Add" free-form row', async () => {
        const user = userEvent.setup();
        renderCombobox();

        const input = screen.getByRole('textbox');
        await user.click(input);
        await user.type(input, 'golang');

        expect(screen.getByRole('button', { name: /Add "golang"/i })).toBeInTheDocument();
      });
    });
  });

  describe('Given the user clicks a suggestion', () => {
    describe('When in multi-select mode', () => {
      it('Then calls onChange with the updated array and clears input', async () => {
        const user = userEvent.setup();
        const { onChange } = renderCombobox({ isMulti: true });

        await user.click(screen.getByRole('textbox'));
        await user.click(screen.getByRole('button', { name: 'react' }));

        expect(onChange).toHaveBeenCalledWith(['react']);
      });
    });

    describe('When in single-select mode', () => {
      it('Then calls onChange with just the selected string', async () => {
        const user = userEvent.setup();
        const { onChange } = renderCombobox({ isMulti: false });

        await user.click(screen.getByRole('textbox'));
        await user.click(screen.getByRole('button', { name: 'react' }));

        expect(onChange).toHaveBeenCalledWith('react');
      });
    });
  });

  describe('Given the user presses Enter with a suggestion visible', () => {
    describe('When the first suggestion matches', () => {
      it('Then selects the first suggestion', async () => {
        const user = userEvent.setup();
        const { onChange } = renderCombobox({ isMulti: true });

        const input = screen.getByRole('textbox');
        await user.click(input);
        await user.type(input, 'react');
        await user.keyboard('{Enter}');

        expect(onChange).toHaveBeenCalledWith(['react']);
      });
    });
  });

  describe('Given the user presses Enter with no matching suggestion', () => {
    describe('When input is a free-form value not in the list', () => {
      it('Then adds the free-form value', async () => {
        const user = userEvent.setup();
        const { onChange } = renderCombobox({ isMulti: true });

        const input = screen.getByRole('textbox');
        await user.click(input);
        await user.type(input, 'golang');
        await user.keyboard('{Enter}');

        expect(onChange).toHaveBeenCalledWith(['golang']);
      });
    });
  });

  describe('Given values are already selected', () => {
    describe('When rendered with pre-selected values', () => {
      it('Then shows badges for each selected value', () => {
        renderCombobox({ value: ['react', 'typescript'], isMulti: true });

        expect(screen.getByText('react')).toBeInTheDocument();
        expect(screen.getByText('typescript')).toBeInTheDocument();
      });
    });

    describe('When the remove button is clicked', () => {
      it('Then calls onChange with the value removed', async () => {
        const user = userEvent.setup();
        const { onChange } = renderCombobox({ value: ['react', 'typescript'], isMulti: true });

        // There are 2 X buttons, one per badge
        const removeButtons = screen.getAllByRole('button').filter(b => b.querySelector('svg'));
        await user.click(removeButtons[0]!);

        expect(onChange).toHaveBeenCalledWith(['typescript']);
      });
    });
  });

  describe('Given a duplicate value is typed', () => {
    describe('When the user attempts to add an already-selected value', () => {
      it('Then does not call onChange with a duplicate', async () => {
        const user = userEvent.setup();
        const { onChange } = renderCombobox({ value: ['react'], isMulti: true });

        await user.click(screen.getByRole('textbox'));
        await user.click(screen.getByRole('button', { name: 'react' }));

        expect(onChange).not.toHaveBeenCalled();
      });
    });
  });
});
