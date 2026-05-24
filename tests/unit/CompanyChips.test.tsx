import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompanyChips } from '@/components/CompanyChips';

describe('<CompanyChips>', () => {
  const OPTIONS = ['OpenAI', 'Anthropic', 'Meta AI'] as const;

  it('renders one chip per option', () => {
    render(<CompanyChips options={OPTIONS} selected={[]} onToggle={() => {}} />);
    OPTIONS.forEach((company) => {
      expect(screen.getByRole('button', { name: company })).toBeInTheDocument();
    });
  });

  it('marks selected chips with the accent class', () => {
    render(<CompanyChips options={OPTIONS} selected={['Anthropic']} onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: 'Anthropic' }).className).toMatch(/border-accent/);
    expect(screen.getByRole('button', { name: 'OpenAI' }).className).not.toMatch(/bg-accent\/20/);
  });

  it('invokes onToggle with the clicked company name', async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    render(<CompanyChips options={OPTIONS} selected={[]} onToggle={onToggle} />);

    await user.click(screen.getByRole('button', { name: 'Meta AI' }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('Meta AI');
  });
});
