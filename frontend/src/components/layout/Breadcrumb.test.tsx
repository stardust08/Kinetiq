import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Breadcrumb } from './Breadcrumb';

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('Breadcrumb', () => {
  it('renders home icon', () => {
    renderWithRouter(<Breadcrumb items={[]} />);
    
    const homeLink = screen.getByLabelText('Home');
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('href', '/');
  });

  it('renders single breadcrumb item without link', () => {
    renderWithRouter(
      <Breadcrumb items={[{ label: 'Bookings' }]} />
    );
    
    expect(screen.getByText('Bookings')).toBeInTheDocument();
    expect(screen.getByText('Bookings')).toHaveClass('font-medium');
  });

  it('renders multiple breadcrumb items with links', () => {
    renderWithRouter(
      <Breadcrumb 
        items={[
          { label: 'Bookings', href: '/bookings' },
          { label: 'Assessment Details' }
        ]} 
      />
    );
    
    const bookingsLink = screen.getByText('Bookings');
    expect(bookingsLink).toBeInTheDocument();
    expect(bookingsLink).toHaveAttribute('href', '/bookings');
    
    const detailsText = screen.getByText('Assessment Details');
    expect(detailsText).toBeInTheDocument();
    expect(detailsText).toHaveClass('font-medium');
  });

  it('renders chevron separators between items', () => {
    const { container } = renderWithRouter(
      <Breadcrumb 
        items={[
          { label: 'Bookings', href: '/bookings' },
          { label: 'Details' }
        ]} 
      />
    );
    
    // Should have 2 chevrons (one after home, one between items)
    const chevrons = container.querySelectorAll('svg');
    expect(chevrons.length).toBeGreaterThanOrEqual(2);
  });

  it('applies custom className', () => {
    const { container } = renderWithRouter(
      <Breadcrumb items={[]} className="custom-class" />
    );
    
    const nav = container.querySelector('nav');
    expect(nav).toHaveClass('custom-class');
  });

  it('last item is not a link even if href is provided', () => {
    renderWithRouter(
      <Breadcrumb 
        items={[
          { label: 'Bookings', href: '/bookings' },
          { label: 'Details', href: '/details' }
        ]} 
      />
    );
    
    const detailsText = screen.getByText('Details');
    expect(detailsText.tagName).toBe('SPAN');
    expect(detailsText).toHaveClass('font-medium');
  });

  it('renders aria-label for accessibility', () => {
    const { container } = renderWithRouter(
      <Breadcrumb items={[{ label: 'Test' }]} />
    );
    
    const nav = container.querySelector('nav');
    expect(nav).toHaveAttribute('aria-label', 'Breadcrumb');
  });
});
