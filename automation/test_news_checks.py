"""Run: python3 automation/test_news_checks.py"""
from news_checks import same_story, fix_missing_times


def test_same_story():
    assert same_story('Richmond Council OKs Waldorf School Land Purchase',
                      'City Council OKs Waldorf School purchase of triangle of land off Brookland Parkway')
    assert not same_story('Pasadena Waldorf School Brings Back 38th Annual Elves\' Faire to Altadena',
                          'First 50 years of Camphill told in new book launched in Kilkenny')
    assert not same_story('Nelson Waldorf School opens new playground',
                          'Richmond Waldorf School buys land from the city')
    assert not same_story('', 'Anything')


def test_fix_missing_times():
    s = 'will host its 38th annual Elves\' Faire on Saturday, November 21, 2026, from a. m. to p. m. at its McComb Campus.'
    assert fix_missing_times(s) == 'will host its 38th annual Elves\' Faire on Saturday, November 21, 2026, at its McComb Campus.'
    real = 'The fair runs from 10 a.m. to 4 p.m. on Saturday.'
    assert fix_missing_times(real) == real
    assert fix_missing_times('Doors open at p.m., all welcome.') == 'Doors open, all welcome.'


if __name__ == '__main__':
    test_same_story()
    test_fix_missing_times()
    print('All news checks passed')
