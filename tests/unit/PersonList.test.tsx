import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PersonList } from '@/components/PersonList';
import type { Person } from '@/lib/types';

const people: Person[] = [
  {
    name: 'Ada Lovelace',
    company: 'Verily',
    role: 'Group Product Manager',
    why: 'Leads the care navigation product line.',
    hook: 'Both University of Waterloo grads.',
    score: 9,
    tags: ['Product Leader'],
    linkedin_query: 'Ada Lovelace Verily product manager',
    message: 'Hi Ada, message body here.',
  },
  {
    name: 'Charles Babbage',
    company: 'Oscar Health',
    role: 'Founder',
    why: 'Started a digital health company from an engineering background.',
    hook: 'Shared ML background.',
    score: 7,
    tags: [],
    linkedin_query: 'Charles Babbage Oscar Health',
    message: 'Hi Charles.',
  },
];

describe('PersonList', () => {
  it('renders one list row per person showing name, role, and company', () => {
    render(<PersonList people={people} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Charles Babbage')).toBeInTheDocument();
    expect(screen.getByText(/Group Product Manager/)).toBeInTheDocument();
    expect(screen.getByText(/Verily/)).toBeInTheDocument();
  });

  it('keeps the outreach message collapsed until its row is expanded', async () => {
    render(<PersonList people={people} />);
    expect(screen.queryByText('Hi Ada, message body here.')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Ada Lovelace/i }));

    expect(screen.getByText('Hi Ada, message body here.')).toBeInTheDocument();
  });
});
