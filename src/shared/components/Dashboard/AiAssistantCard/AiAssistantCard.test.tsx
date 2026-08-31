import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { AiAssistantCard } from './AiAssistantCard.tsx';

describe('AiAssistantCard', () => {
  it('renders its key surfaces', async () => {
    renderWithProviders(<AiAssistantCard />);

    expect(await screen.findByTestId('dashboard-ai-card')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-ai-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-ai-chip-usage')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<AiAssistantCard />);
    await screen.findByTestId('dashboard-ai-card');
    expect(await axe(container)).toHaveNoViolations();
  });
});
