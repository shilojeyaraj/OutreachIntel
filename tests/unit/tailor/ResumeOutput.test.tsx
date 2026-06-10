import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResumeOutput from '@/components/tailor/ResumeOutput';

it('shows the LaTeX and copies it on click', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });

  render(
    <ResumeOutput
      tailoredLatex={'\\documentclass{article}'}
      changes={[{ section: 'Skills', before: 'a', after: 'b', why: 'match job' }]}
    />,
  );

  expect(screen.getByText(/documentclass/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /copy/i }));
  expect(writeText).toHaveBeenCalledWith('\\documentclass{article}');
  expect(screen.getByText(/match job/)).toBeInTheDocument();
});

it('renders an empty-state message when there is no resume', () => {
  render(<ResumeOutput tailoredLatex="" changes={[]} error="Resume tailoring failed." />);
  expect(screen.getByText(/resume tailoring failed/i)).toBeInTheDocument();
});
